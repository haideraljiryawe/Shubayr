import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import {
  ACCESS_POLICY_KEY,
  type AccessPolicy,
} from '../decorators/access-policy.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const policy = this.reflector.getAllAndOverride<AccessPolicy>(
      ACCESS_POLICY_KEY,
      [context.getHandler(), context.getClass()],
    );
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || policy?.access === 'public';
    return isPublic ? true : super.canActivate(context);
  }
}
