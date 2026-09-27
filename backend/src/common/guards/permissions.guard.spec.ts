import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Policy } from '../decorators/access-policy.decorator';
import {
  PermissionsGuard,
  type AuthenticatedRequestUser,
} from './permissions.guard';

function context(
  controller: object,
  handler: () => void,
  user?: AuthenticatedRequestUser,
  body: Record<string, unknown> = {},
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => controller.constructor,
    switchToHttp: () => ({ getRequest: () => ({ user, body }) }),
  } as never;
}

describe('PermissionsGuard access policies', () => {
  const guard = new PermissionsGuard(new Reflector());
  const admin: AuthenticatedRequestUser = {
    id: 'admin',
    phone: null,
    username: 'admin',
    role: null,
    surface: 'admin',
    client: null,
    permissions: ['catalog.products'],
    permissionVersion: 1,
    mustChangePassword: false,
  };

  it('allows an admin identity with the current permission', () => {
    class Controller {
      @Policy({
        access: 'authenticated',
        surfaces: ['admin'],
        permissions: ['catalog.products'],
      })
      handler(this: void) {}
    }
    const instance = new Controller();
    expect(guard.canActivate(context(instance, instance.handler, admin))).toBe(
      true,
    );
  });

  it('rejects an app token even when it carries a forged admin permission', () => {
    class Controller {
      @Policy({
        access: 'authenticated',
        surfaces: ['admin'],
        permissions: ['catalog.products'],
      })
      handler(this: void) {}
    }
    const instance = new Controller();
    const appUser: AuthenticatedRequestUser = {
      ...admin,
      surface: 'app',
      phone: '+9647700000006',
      username: null,
      role: 'customer',
      client: 'mobile',
    };
    expect(() =>
      guard.canActivate(context(instance, instance.handler, appUser)),
    ).toThrow(ForbiddenException);
  });

  it('rejects a route without policy metadata', () => {
    class Controller {
      handler(this: void) {}
    }
    const instance = new Controller();
    expect(() =>
      guard.canActivate(context(instance, instance.handler, admin)),
    ).toThrow(ForbiddenException);
  });
});
