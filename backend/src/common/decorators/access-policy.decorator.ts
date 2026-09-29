import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '../access/permission-registry';

export const ACCESS_POLICY_KEY = 'accessPolicy';

export type AuthSurface = 'admin' | 'app';
export type AppRole = 'customer' | 'delivery_agent' | 'order_monitor';

export type DynamicPermission = {
  field: string;
  map: Readonly<Record<string, PermissionKey>>;
};

export type AccessPolicy = {
  access: 'public' | 'authenticated';
  surfaces?: readonly AuthSurface[];
  appRoles?: readonly AppRole[];
  permissions?: readonly PermissionKey[];
  anyPermissions?: readonly PermissionKey[];
  permissionFromBody?: DynamicPermission;
  allowPasswordChange?: boolean;
  label?: string;
};

export const Policy = (
  policy: AccessPolicy,
): MethodDecorator & ClassDecorator =>
  SetMetadata(ACCESS_POLICY_KEY, Object.freeze(policy));

export const PublicPolicy = (): MethodDecorator & ClassDecorator =>
  Policy({ access: 'public' });

export const AppPolicy = (
  ...appRoles: AppRole[]
): MethodDecorator & ClassDecorator =>
  Policy({ access: 'authenticated', surfaces: ['app'], appRoles });

export const AdminPolicy = (
  ...permissions: PermissionKey[]
): MethodDecorator & ClassDecorator =>
  Policy({ access: 'authenticated', surfaces: ['admin'], permissions });

export const AdminAnyPermissionPolicy = (
  ...anyPermissions: PermissionKey[]
): MethodDecorator & ClassDecorator =>
  Policy({ access: 'authenticated', surfaces: ['admin'], anyPermissions });

export const AnySessionPolicy = (): MethodDecorator & ClassDecorator =>
  Policy({ access: 'authenticated', surfaces: ['admin', 'app'] });
