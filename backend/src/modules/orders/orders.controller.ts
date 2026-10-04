import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  AppPolicy,
  Policy,
} from '../../common/decorators/access-policy.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import {
  OrderQueryDto,
  PlaceOrderDto,
  UpdateOrderStatusDto,
  CustomerCancelDto,
  CancellationRequestDto,
  ShortageResponseDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';
import {
  RateLimitRisk,
  RateLimitTier,
} from '../../common/rate-limit/rate-limit-tier';

type UserRequest = Request & { user: AuthenticatedRequestUser };

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @AppPolicy('customer')
  list(@Req() request: UserRequest, @Query() query: OrderQueryDto) {
    return this.orders.list(request.user.id, query);
  }

  @Post()
  @AppPolicy('customer')
  @RateLimitTier(RateLimitRisk.Strict)
  place(
    @Req() request: UserRequest,
    @Body() input: PlaceOrderDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.orders.place(request.user.id, input, key);
  }

  @Get(':id')
  @AppPolicy('customer')
  detail(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
  ) {
    return this.orders.getOwned(request.user.id, id);
  }

  @Get(':id/track')
  @AppPolicy('customer')
  track(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
  ) {
    return this.orders.track(request.user.id, id);
  }

  @Post(':id/cancel')
  @AppPolicy('customer')
  @HttpCode(200)
  cancel(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: CustomerCancelDto,
  ) {
    return this.orders.cancel(request.user.id, id, input);
  }

  @Post(':id/cancellation-request')
  @AppPolicy('customer')
  @HttpCode(200)
  requestCancellation(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: CancellationRequestDto,
  ) {
    return this.orders.requestCancellation(request.user.id, id, input);
  }

  @Post(':id/shortage-response')
  @AppPolicy('customer')
  @HttpCode(200)
  shortageResponse(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: ShortageResponseDto,
  ) {
    return this.orders.respondToShortage(request.user.id, id, input);
  }

  @Policy({
    access: 'authenticated',
    surfaces: ['admin'],
    permissionFromBody: {
      field: 'status',
      map: {
        confirmed: 'orders.accept',
        preparing: 'orders.prepare',
        ready_for_dispatch: 'orders.mark_ready',
        dispatched: 'orders.handover',
      },
    },
  })
  @Patch(':id/status')
  status(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: UpdateOrderStatusDto,
  ) {
    return this.orders.updateStatus(
      request.user.id,
      id,
      input,
      request.user.permissions,
    );
  }
}
