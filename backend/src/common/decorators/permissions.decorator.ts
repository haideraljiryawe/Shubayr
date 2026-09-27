import { applyDecorators, SetMetadata } from '@nestjs/common';
import {
  isPermissionKey,
  type PermissionKey,
} from '../access/permission-registry';
import { AdminPolicy } from './access-policy.decorator';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (
  ...permissions: string[]
): MethodDecorator & ClassDecorator => {
  const invalid = permissions.filter(
    (permission) => !isPermissionKey(permission),
  );
  if (invalid.length)
    throw new Error(`Unknown permission(s): ${invalid.join(', ')}`);
  return applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permissions),
    AdminPolicy(...(permissions as PermissionKey[])),
  );
};
