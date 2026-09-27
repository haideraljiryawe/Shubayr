import { Injectable, type OnApplicationBootstrap, Type } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, Reflector } from '@nestjs/core';
import {
  ACCESS_POLICY_KEY,
  type AccessPolicy,
} from '../decorators/access-policy.decorator';

type RouteHandler = (...args: never[]) => unknown;

@Injectable()
export class RoutePolicyCoverageService implements OnApplicationBootstrap {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap(): void {
    const uncovered: string[] = [];

    for (const wrapper of this.discovery.getControllers()) {
      const controller = wrapper.metatype as Type<unknown> | undefined;
      if (!controller) {
        continue;
      }

      for (const [methodName, handler] of this.routeHandlers(controller)) {
        const policy = this.reflector.getAllAndOverride<AccessPolicy>(
          ACCESS_POLICY_KEY,
          [handler, controller],
        );

        if (!policy) {
          uncovered.push(`${controller.name}.${methodName}`);
        }
      }
    }

    if (uncovered.length > 0) {
      throw new Error(
        `Access policy metadata is required for every route: ${uncovered.join(', ')}`,
      );
    }
  }

  private routeHandlers(
    controller: Type<unknown>,
  ): Array<[methodName: string, handler: RouteHandler]> {
    const handlers: Array<[string, RouteHandler]> = [];
    const seen = new Set<string>();
    let prototype: object | null = controller.prototype as object;

    while (prototype && prototype !== Object.prototype) {
      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        if (methodName === 'constructor' || seen.has(methodName)) {
          continue;
        }
        seen.add(methodName);

        const handler: unknown = Object.getOwnPropertyDescriptor(
          prototype,
          methodName,
        )?.value;
        if (typeof handler === 'function') {
          const routeHandler = handler as RouteHandler;
          if (
            Reflect.getMetadata(METHOD_METADATA, routeHandler) !== undefined
          ) {
            handlers.push([methodName, routeHandler]);
          }
        }
      }
      prototype = Object.getPrototypeOf(prototype) as object | null;
    }

    return handlers;
  }
}
