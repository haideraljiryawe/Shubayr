import { ConflictException } from '@nestjs/common';
import type { OrderStatus } from './dto/order.dto';

/** The single server-side order state machine. Side effects stay in services. */
export const ORDER_TRANSITIONS: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = Object.freeze({
  pending: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready_for_dispatch', 'cancelled'],
  ready_for_dispatch: ['dispatched', 'cancelled'],
  dispatched: ['delivered', 'failed', 'cancelled'],
  failed: ['dispatched', 'ready_for_dispatch', 'cancelled'],
  delivered: ['return_requested'],
  return_requested: ['returned'],
  returned: [],
  rejected: [],
  cancelled: [],
});

export function assertOrderTransition(
  current: string,
  next: string,
  version: number,
  expectedVersion: number,
): asserts next is OrderStatus {
  if (version !== expectedVersion) {
    throw staleOrder(current, version);
  }
  if (
    !ORDER_TRANSITIONS[current as OrderStatus]?.includes(next as OrderStatus)
  ) {
    throw staleOrder(
      current,
      version,
      'Order status transition is not allowed',
    );
  }
}

export function staleOrder(
  currentStatus: string,
  currentVersion: number,
  message = 'The order changed while you were working',
) {
  return new ConflictException({
    status: 409,
    code: 'STALE_ORDER_STATE',
    message,
    errors: [
      {
        field: 'version',
        code: 'STALE_ORDER_STATE',
        message,
        current_status: currentStatus,
        current_version: currentVersion,
      },
    ],
  });
}
