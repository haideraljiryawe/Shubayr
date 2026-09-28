jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

import type { ExecutionContext, Type } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEYS } from '../access/permission-registry';
import {
  ACCESS_POLICY_KEY,
  type AccessPolicy,
} from '../decorators/access-policy.decorator';
import {
  AdminAuthController,
  AuthController,
} from '../../modules/auth/auth.controller';
import { MeController } from '../../modules/auth/me.controller';
import {
  AdminBannersController,
  PublicBannersController,
} from '../../modules/banners/banners.controller';
import {
  AdminCategoriesController,
  AdminProductsController,
} from '../../modules/catalog/admin-catalog.controller';
import { CatalogController } from '../../modules/catalog/catalog.controller';
import { DeliveriesController } from '../../modules/fulfilment/deliveries.controller';
import { HealthController } from '../../modules/health/health.controller';
import {
  AdminLoyaltyController,
  LoyaltyController,
} from '../../modules/loyalty/loyalty.controller';
import { MediaController } from '../../modules/media/media.controller';
import { NotificationsController } from '../../modules/notifications/notifications.controller';
import { AddressesController } from '../../modules/orders/addresses.controller';
import { AdminOrdersController } from '../../modules/orders/admin-orders.controller';
import {
  CartController,
  CouponController,
} from '../../modules/orders/cart.controller';
import { OrdersController } from '../../modules/orders/orders.controller';
import { MonitorOrdersController } from '../../modules/orders/monitor-orders.controller';
import {
  PermissionsController,
  PresetsController,
  StaffController,
  WorkPhonesController,
} from '../../modules/rbac/access-management.controller';
import { ReturnsController } from '../../modules/returns/returns.controller';
import {
  AdminReviewsController,
  ReviewsController,
} from '../../modules/reviews/reviews.controller';
import { SettingsController } from '../../modules/settings/settings.controller';
import { WishlistController } from '../../modules/wishlist/wishlist.controller';
import {
  PermissionsGuard,
  type AuthenticatedRequestUser,
} from './permissions.guard';

const controllers: Type[] = [
  AuthController,
  AdminAuthController,
  MeController,
  PublicBannersController,
  AdminBannersController,
  AdminCategoriesController,
  AdminProductsController,
  CatalogController,
  DeliveriesController,
  HealthController,
  LoyaltyController,
  AdminLoyaltyController,
  MediaController,
  NotificationsController,
  AddressesController,
  AdminOrdersController,
  CartController,
  CouponController,
  OrdersController,
  MonitorOrdersController,
  StaffController,
  PresetsController,
  PermissionsController,
  WorkPhonesController,
  ReturnsController,
  ReviewsController,
  AdminReviewsController,
  SettingsController,
  WishlistController,
];

const allPermissions = [...PERMISSION_KEYS];
const customer: AuthenticatedRequestUser = {
  id: 'customer',
  phone: '+9647700000006',
  username: null,
  role: 'customer',
  surface: 'app',
  client: 'mobile',
  permissions: [],
  permissionVersion: 1,
  sessionVersion: 1,
  mustChangePassword: false,
};
const delivery = {
  ...customer,
  id: 'delivery',
  role: 'delivery_agent' as const,
};
const monitor = { ...customer, id: 'monitor', role: 'order_monitor' as const };
const admin = {
  ...customer,
  id: 'admin',
  phone: null,
  username: 'admin',
  role: null,
  surface: 'admin' as const,
  client: null,
  permissions: allPermissions,
};
const adminWithout = { ...admin, id: 'admin-without', permissions: [] };
const sameAdminOnApp = {
  ...customer,
  id: 'admin',
  permissions: allPermissions,
};

function policyFor(
  controller: Type,
  handler: object,
): AccessPolicy | undefined {
  const methodPolicy = Reflect.getMetadata(ACCESS_POLICY_KEY, handler) as
    AccessPolicy | undefined;
  const controllerPolicy = Reflect.getMetadata(
    ACCESS_POLICY_KEY,
    controller,
  ) as AccessPolicy | undefined;
  return methodPolicy ?? controllerPolicy;
}

function expected(
  policy: AccessPolicy,
  user?: AuthenticatedRequestUser,
): boolean {
  if (policy.access === 'public') return true;
  if (!user) return false;
  if (policy.surfaces?.length && !policy.surfaces.includes(user.surface))
    return false;
  if (user.surface === 'app' && policy.appRoles?.length) {
    if (!user.role || !policy.appRoles.includes(user.role)) return false;
  }
  if (user.surface === 'admin') {
    const requiresPermission = Boolean(
      policy.permissions?.length || policy.permissionFromBody,
    );
    if (requiresPermission && user.permissions.length === 0) return false;
  }
  return true;
}

describe('route authorization matrix', () => {
  const guard = new PermissionsGuard(new Reflector());
  const identities: Array<[string, AuthenticatedRequestUser | undefined]> = [
    ['anonymous', undefined],
    ['customer', customer],
    ['delivery_agent', delivery],
    ['order_monitor', monitor],
    ['admin_with_permission', admin],
    ['admin_without_permission', adminWithout],
    ['same_admin_on_app_session', sameAdminOnApp],
  ];

  for (const controller of controllers) {
    const prototype = controller.prototype as unknown as Record<
      string,
      unknown
    >;
    for (const methodName of Object.getOwnPropertyNames(prototype)) {
      if (methodName === 'constructor') continue;
      const handler = prototype[methodName] as object;
      if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
      const policy = policyFor(controller, handler);

      it(`${controller.name}.${methodName} declares a policy`, () => {
        expect(policy).toBeDefined();
      });

      for (const [identity, user] of identities) {
        it(`${controller.name}.${methodName} x ${identity}`, () => {
          expect(policy).toBeDefined();
          const body: Record<string, unknown> = {};
          if (policy?.permissionFromBody) {
            body[policy.permissionFromBody.field] = Object.keys(
              policy.permissionFromBody.map,
            )[0];
          }
          const context = {
            getHandler: () => handler,
            getClass: () => controller,
            switchToHttp: () => ({ getRequest: () => ({ user, body }) }),
          } as ExecutionContext;
          let allowed = true;
          try {
            guard.canActivate(context);
          } catch {
            allowed = false;
          }
          expect(allowed).toBe(expected(policy!, user));
        });
      }
    }
  }
});
