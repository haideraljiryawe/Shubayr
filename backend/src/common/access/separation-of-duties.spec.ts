import { ForbiddenException } from '@nestjs/common';
import {
  assertDifferentActor,
  assertPurchaseCreatorSeparation,
  separationOfDutiesLevel,
} from './separation-of-duties';

describe('assertDifferentActor', () => {
  it('allows distinct actors', () => {
    expect(() => assertDifferentActor('actor', 'originator')).not.toThrow();
  });

  it('rejects self approval', () => {
    expect(() => assertDifferentActor('same', 'same')).toThrow(
      ForbiddenException,
    );
  });
});

describe('configured purchase separation of duties', () => {
  function db(value: string | null) {
    return {
      storeSetting: {
        findUnique: jest
          .fn()
          .mockResolvedValue(value === null ? null : { value }),
      },
    };
  }

  it('defaults to standard and allows the creator to pay or return', async () => {
    const reader = db(null);
    await expect(separationOfDutiesLevel(reader)).resolves.toBe('standard');
    await expect(
      assertPurchaseCreatorSeparation(
        reader,
        'same',
        'same',
        'payment',
        'refused',
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertPurchaseCreatorSeparation(
        reader,
        'same',
        'same',
        'return',
        'refused',
      ),
    ).resolves.toBeUndefined();
  });

  it('strict mode refuses creator payments and returns', async () => {
    for (const action of ['payment', 'return'] as const) {
      await expect(
        assertPurchaseCreatorSeparation(
          db('strict'),
          'same',
          'same',
          action,
          'refused',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('refuses creator cost corrections at both levels', async () => {
    for (const level of ['standard', 'strict']) {
      await expect(
        assertPurchaseCreatorSeparation(
          db(level),
          'same',
          'same',
          'cost_correction',
          'refused',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });
});
