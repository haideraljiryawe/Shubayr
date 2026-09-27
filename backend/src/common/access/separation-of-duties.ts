import { ForbiddenException } from '@nestjs/common';

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
