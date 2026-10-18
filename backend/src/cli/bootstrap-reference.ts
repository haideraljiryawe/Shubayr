import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import {
  PERMISSION_REGISTRY,
  SEEDED_PRESET_GRANTS,
} from '../common/access/permission-registry';
import {
  REFERENCE_MINIMUMS,
  REFERENCE_ROLES,
  REFERENCE_SETTINGS,
  presetDescription,
} from './bootstrap-policy';

/**
 * Production reference data, after `prisma migrate deploy`:
 *
 *   node dist/src/cli/bootstrap-reference.js
 *
 * The migrations already seed governorates, the chart of accounts and the
 * currencies; this checks they are there and brings the app roles, the
 * permission registry and the built-in permission presets in line with the
 * code. It creates no products, users, orders or delivery zones, and it is
 * safe to run again after every deploy.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_REQUIRED');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    const [governorates, ledgerAccounts, base] = await Promise.all([
      prisma.governorate.count(),
      prisma.ledgerAccount.count(),
      prisma.currency.findFirst({ where: { is_base: true } }),
    ]);
    if (governorates < REFERENCE_MINIMUMS.governorates)
      throw new Error(`GOVERNORATES_MISSING (${governorates})`);
    if (ledgerAccounts < REFERENCE_MINIMUMS.ledgerAccounts)
      throw new Error(`CHART_OF_ACCOUNTS_MISSING (${ledgerAccounts})`);
    if (base?.code !== REFERENCE_MINIMUMS.baseCurrency)
      throw new Error(`BASE_CURRENCY_NOT_IQD (${base?.code ?? 'none'})`);

    for (const [name, description] of REFERENCE_ROLES) {
      await prisma.role.upsert({
        where: { name },
        update: { description, is_system: true },
        create: { name, description, is_system: true },
      });
    }

    const permissionIds = new Map<string, string>();
    for (const [key, [group, description]] of Object.entries(
      PERMISSION_REGISTRY,
    )) {
      const permission = await prisma.permission.upsert({
        where: { key },
        update: { group, description },
        create: { key, group, description },
      });
      permissionIds.set(key, permission.id);
    }

    for (const [name, keys] of Object.entries(SEEDED_PRESET_GRANTS)) {
      const existing = await prisma.permissionPreset.findUnique({
        where: { name },
      });
      const preset = await prisma.permissionPreset.upsert({
        where: { name },
        update: {
          description: presetDescription(name, existing?.description),
          is_system: true,
        },
        create: { name, description: presetDescription(name), is_system: true },
      });
      // A built-in preset is exactly the code's list (owners create their own).
      await prisma.$transaction([
        prisma.presetPermission.deleteMany({ where: { preset_id: preset.id } }),
        prisma.presetPermission.createMany({
          data: keys.map((key) => ({
            preset_id: preset.id,
            permission_id: permissionIds.get(key)!,
          })),
        }),
      ]);
    }

    for (const [key, value] of REFERENCE_SETTINGS) {
      await prisma.storeSetting.upsert({
        where: { key },
        update: {},
        create: { key, value },
      });
    }

    process.stdout.write(
      `Reference data ready: ${governorates} governorates, ${ledgerAccounts} ledger accounts, base currency ${base.code}, ` +
        `${REFERENCE_ROLES.length} app roles, ${permissionIds.size} permissions, ${Object.keys(SEEDED_PRESET_GRANTS).length} built-in presets. ` +
        'No demo data was created.\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Bootstrap failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
