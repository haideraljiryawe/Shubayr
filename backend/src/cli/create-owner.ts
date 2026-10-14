import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../modules/auth/password';
import {
  OWNER_PRESET,
  assertOwnerPassword,
  parseOwnerArgs,
  temporaryPassword,
} from './bootstrap-policy';

/**
 * The store owner's Web Admin account, once, after bootstrap-reference:
 *
 *   node dist/src/cli/create-owner.js --username owner --name "Store owner" [--email …]
 *
 * The account gets the built-in super_admin preset and must change its
 * password at the first sign-in. The one-time password is printed once —
 * or taken from OWNER_PASSWORD when set (it must meet the staff policy).
 * An existing username is refused, never overwritten.
 */
async function main(): Promise<void> {
  const options = parseOwnerArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_REQUIRED');
  const supplied = process.env.OWNER_PASSWORD;
  if (supplied) assertOwnerPassword(supplied);
  const password = supplied || temporaryPassword();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    const preset = await prisma.permissionPreset.findUnique({
      where: { name: OWNER_PRESET },
    });
    if (!preset) throw new Error('RUN_BOOTSTRAP_REFERENCE_FIRST');
    if (await prisma.user.findUnique({ where: { username: options.username } }))
      throw new Error('USERNAME_TAKEN');

    const passwordHash = await hashPassword(password);
    const owner = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: options.username,
          name: options.name,
          email: options.email,
          password_hash: passwordHash,
          must_change_password: true,
          is_active: true,
        },
      });
      await tx.userPreset.create({
        data: {
          user_id: user.id,
          preset_id: preset.id,
          assigned_by: user.id,
          reason: 'Production bootstrap: store owner',
        },
      });
      await tx.auditLog.create({
        data: {
          actor_id: user.id,
          action: 'staff.bootstrap_owner',
          entity_type: 'user',
          entity_id: user.id,
          after: {
            username: user.username,
            preset: OWNER_PRESET,
            must_change_password: true,
          },
          reason: 'Production bootstrap: store owner',
        },
      });
      return user;
    });

    process.stdout.write(
      [
        `Owner account created: ${owner.username} (${OWNER_PRESET}).`,
        supplied
          ? 'Password: the one given in OWNER_PASSWORD.'
          : `One-time password (shown once): ${password}`,
        'It must be changed at the first sign-in to the Web Admin.',
        '',
      ].join('\n'),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Owner not created: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
