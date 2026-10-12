import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { conflict } from '../../common/http/api-error';

type Tx = Prisma.TransactionClient;

export type ExternalDriverTripEventType =
  | 'handover'
  | 'started'
  | 'delivered'
  | 'failed'
  | 'return_at_door'
  | 'lost'
  | 'closed';

@Injectable()
export class ExternalDriverTripHistoryService {
  record(
    tx: Tx,
    input: {
      actorId: string;
      operationId: string;
      tripId: string;
      orderId?: string;
      type: ExternalDriverTripEventType;
      source: string;
      note?: string;
      eventAt: Date;
    },
  ) {
    return tx.externalDriverTripEvent.create({
      data: {
        trip_id: input.tripId,
        order_id: input.orderId,
        operation_id: input.operationId,
        type: input.type,
        source: input.source.trim(),
        note: input.note?.trim() || null,
        event_at: input.eventAt,
        recorded_by: input.actorId,
      },
    });
  }

  async recordForOrder(
    tx: Tx,
    input: {
      actorId: string;
      operationId: string;
      orderId: string;
      expectedTripId?: string;
      requireInProgress?: boolean;
      type: Extract<
        ExternalDriverTripEventType,
        'delivered' | 'failed' | 'return_at_door' | 'lost'
      >;
      source: string;
      note?: string;
      eventAt: Date;
    },
  ) {
    const tripOrder = await tx.externalDriverTripOrder.findUnique({
      where: { order_id: input.orderId },
      select: { trip_id: true, trip: { select: { status: true } } },
    });
    if (!tripOrder) {
      if (input.expectedTripId) {
        throw new NotFoundException(
          'Order is not part of an external-driver trip',
        );
      }
      return null;
    }
    if (input.expectedTripId && tripOrder.trip_id !== input.expectedTripId) {
      throw conflict(
        'TRIP_ORDER_NOT_FOUND',
        'Order is not part of this external-driver trip',
      );
    }
    if (input.requireInProgress && tripOrder.trip.status !== 'in_progress') {
      throw conflict(
        'TRIP_NOT_IN_PROGRESS',
        'Trip order events require an in-progress trip',
      );
    }
    return this.record(tx, {
      ...input,
      tripId: tripOrder.trip_id,
    });
  }
}
