import { applyDecorators, SetMetadata } from '@nestjs/common';
import { PublicPolicy } from './access-policy.decorator';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator & ClassDecorator =>
  applyDecorators(SetMetadata(IS_PUBLIC_KEY, true), PublicPolicy());
