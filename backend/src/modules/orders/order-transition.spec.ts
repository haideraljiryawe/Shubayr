import { ConflictException } from '@nestjs/common';
import { ORDER_TRANSITIONS, assertOrderTransition } from './order-transition';

describe('order lifecycle transition table', () => {
  it('accepts every declared edge and rejects every other status pair', () => {
    const statuses = Object.keys(ORDER_TRANSITIONS);
    for (const current of statuses) {
      for (const next of statuses) {
        if (
          ORDER_TRANSITIONS[current as keyof typeof ORDER_TRANSITIONS].includes(
            next as never,
          )
        ) {
          expect(() =>
            assertOrderTransition(current, next, 7, 7),
          ).not.toThrow();
        } else {
          expect(() => assertOrderTransition(current, next, 7, 7)).toThrow(
            ConflictException,
          );
        }
      }
    }
  });

  it('rejects a stale version even when the requested edge is legal', () => {
    try {
      assertOrderTransition('pending', 'confirmed', 8, 7);
      throw new Error('Expected a stale-order conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      const response = (error as ConflictException).getResponse();
      expect(response).toEqual(
        expect.objectContaining({
          code: 'STALE_ORDER_STATE',
          errors: [
            expect.objectContaining({
              current_status: 'pending',
              current_version: 8,
            }),
          ],
        }),
      );
    }
  });
});
