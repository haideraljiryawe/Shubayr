import { ForbiddenException } from '@nestjs/common';
import { assertDifferentActor } from './separation-of-duties';

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
