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
} from './dto/order.dto';
import { OrdersService } from './orders.service';

type UserRequest = Request & { user: AuthenticatedRequestUser };

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @AppPolicy('customer', 'order_monitor')
  list(@Req() request: UserRequest, @Query() query: OrderQueryDto) {
    return request.user.role === 'order_monitor'
      ? this.orders.listAdmin(query)
      : this.orders.list(request.user.id, query);
  }

  @Post()
  @AppPolicy('customer')
  place(
    @Req() request: UserRequest,
    @Body() input: PlaceOrderDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.orders.place(request.user.id, input, key);
  }

  @Get(':id')
  @AppPolicy('customer', 'order_monitor')
  detail(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
  ) {
    return request.user.role === 'order_monitor'
      ? this.orders.getAdmin(id)
      : this.orders.getOwned(request.user.id, id);
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
  ) {
    return this.orders.cancel(request.user.id, id);
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
    return this.orders.updateStatus(request.user.id, id, input);
  }
}
