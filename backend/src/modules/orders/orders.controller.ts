import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
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
  list(@Req() request: UserRequest, @Query() query: OrderQueryDto) {
    return this.orders.list(request.user.id, query);
  }

  @Post()
  place(
    @Req() request: UserRequest,
    @Body() input: PlaceOrderDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.orders.place(request.user.id, input, key);
  }

  @Get(':id')
  detail(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
  ) {
    return this.orders.getOwned(request.user.id, id);
  }

  @Get(':id/track')
  track(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
  ) {
    return this.orders.track(request.user.id, id);
  }

  @Post(':id/cancel')
  cancel(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
  ) {
    return this.orders.cancel(request.user.id, id);
  }

  @RequirePermissions('orders.update')
  @Patch(':id/status')
  status(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: UpdateOrderStatusDto,
  ) {
    return this.orders.updateStatus(request.user.id, id, input);
  }
}
