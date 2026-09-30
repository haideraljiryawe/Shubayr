import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ACCESS_POLICY_KEY,
  type AccessPolicy,
  type AppRole,
  type AuthSurface,
} from '../decorators/access-policy.decorator';

export interface AuthenticatedRequestUser {
  id: string;
  phone: string | null;
  username: string | null;
  role: AppRole | null;
  surface: AuthSurface;
  client: 'mobile' | 'web_store' | null;
  permissions: string[];
  permissionVersion: number;
  sessionVersion: number;
  mustChangePassword: boolean;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<AccessPolicy>(
      ACCESS_POLICY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!policy) {
      throw this.forbidden(
        'ROUTE_POLICY_MISSING',
        'This route has no access policy',
      );
    }
    if (policy.access === 'public') return true;

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedRequestUser;
      body?: Record<string, unknown>;
    }>();
    const user = request.user;
    if (!user) {
      throw this.forbidden(
        'AUTHENTICATION_REQUIRED',
        'Authentication required',
      );
    }
    if (policy.surfaces?.length && !policy.surfaces.includes(user.surface)) {
      throw this.forbidden(
        'AUTH_SURFACE_FORBIDDEN',
        `A ${policy.surfaces.join(' or ')} session is required`,
      );
    }
    if (
      user.surface === 'admin' &&
      user.mustChangePassword &&
      !policy.allowPasswordChange
    ) {
      throw this.forbidden(
        'PASSWORD_CHANGE_REQUIRED',
        'The temporary password must be changed before continuing',
      );
    }
    if (user.surface === 'app' && policy.appRoles?.length) {
      if (!user.role || !policy.appRoles.includes(user.role)) {
        const workRole =
          user.role === 'delivery_agent' || user.role === 'order_monitor';
        throw this.forbidden(
          workRole &&
            policy.appRoles.length === 1 &&
            policy.appRoles[0] === 'customer'
            ? 'WORK_ACCOUNT_SHOPPING_FORBIDDEN'
            : 'APP_ROLE_FORBIDDEN',
          workRole
            ? 'Work accounts cannot use customer purchase functions'
            : 'This app role is not allowed to use the route',
        );
      }
    }

    const required = [...(policy.permissions ?? [])];
    if (policy.permissionFromBody) {
      const value = request.body?.[policy.permissionFromBody.field];
      const dynamic =
        typeof value === 'string'
          ? policy.permissionFromBody.map[value]
          : undefined;
      if (!dynamic) {
        throw this.forbidden(
          'PERMISSION_POLICY_UNRESOLVED',
          'The request does not map to an allowed permission',
        );
      }
      required.push(dynamic);
    }
    if (required.length) {
      const granted = new Set(user.permissions);
      if (!required.every((permission) => granted.has(permission))) {
        throw this.forbidden(
          'PERMISSION_DENIED',
          'Missing required permission',
        );
      }
    }
    if (policy.anyPermissions?.length) {
      const granted = new Set(user.permissions);
      if (
        !policy.anyPermissions.some((permission) => granted.has(permission))
      ) {
        throw this.forbidden(
          'PERMISSION_DENIED',
          'Missing required permission',
        );
      }
    }
    return true;
  }

  private forbidden(code: string, message: string): ForbiddenException {
    return new ForbiddenException({ status: 403, code, message, errors: [] });
  }
}
