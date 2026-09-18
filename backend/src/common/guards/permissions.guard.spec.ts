import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

function contextWithPermissions(permissions: string[]): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({
        user: { id: 'user-id', role: 'customer', permissions },
      }),
    }),
  } as never;
}

describe('PermissionsGuard RBAC', () => {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === 'permissions' ? ['catalog.manage'] : false,
    ),
  } as unknown as Reflector;
  const guard = new PermissionsGuard(reflector);

  it('allows an admin identity granted catalog.manage', () => {
    expect(guard.canActivate(contextWithPermissions(['catalog.manage']))).toBe(
      true,
    );
  });

  it('returns 403 for a customer without catalog.manage', () => {
    try {
      guard.canActivate(contextWithPermissions(['catalog.view']));
      throw new Error('Expected guard to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getStatus()).toBe(403);
    }
  });
});
