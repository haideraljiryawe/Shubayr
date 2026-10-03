import { ForbiddenException } from '@nestjs/common';

export type SeparationOfDutiesLevel = 'standard' | 'strict';
export type PurchaseFollowUpAction = 'payment' | 'return' | 'cost_correction';

type SettingsReader = {
  storeSetting: {
    findUnique(input: {
      where: { key: string };
      select: { value: true };
    }): Promise<{ value: string | null } | null>;
  };
};

export function assertDifferentActor(
  actorId: string,
  beneficiaryOrOriginatorId: string,
  message = 'The actor cannot approve their own transaction',
): void {
  if (actorId === beneficiaryOrOriginatorId) {
    throw new ForbiddenException({
      status: 403,
      code: 'SEPARATION_OF_DUTIES_VIOLATION',
      message,
      errors: [],
    });
  }
}

export async function separationOfDutiesLevel(
  db: SettingsReader,
): Promise<SeparationOfDutiesLevel> {
  const configured = await db.storeSetting.findUnique({
    where: { key: 'separation_of_duties_level' },
    select: { value: true },
  });
  return configured?.value === 'strict' ? 'strict' : 'standard';
}

/**
 * Cost corrections always need a different actor. Payments and purchase
 * returns do so only in strict mode; standard mode deliberately allows the
 * purchase creator to perform those follow-up actions.
 */
export async function assertPurchaseCreatorSeparation(
  db: SettingsReader,
  actorId: string,
  purchaseCreatorId: string,
  action: PurchaseFollowUpAction,
  message: string,
): Promise<void> {
  if (
    action === 'cost_correction' ||
    (await separationOfDutiesLevel(db)) === 'strict'
  ) {
    assertDifferentActor(actorId, purchaseCreatorId, message);
  }
}
