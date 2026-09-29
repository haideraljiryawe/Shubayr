import {
  Body,
  Controller,
  Get,
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
  AdminPolicy,
  Policy,
} from '../../common/decorators/access-policy.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import {
  AdminOrderQueryDto,
  CancelOrderDto,
  RejectOrderDto,
  UpdateOrderStatusDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';

type StaffRequest = Request & { user: AuthenticatedRequestUser };

@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @AdminPolicy('orders.view')
  list(@Query() query: AdminOrderQueryDto) {
    return this.orders.listAdmin(query);
  }

  @Get(':id')
  @AdminPolicy('orders.view')
  detail(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
  ) {
    return this.orders.getAdmin(id);
  }

  @Patch(':id/status')
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
  status(
    @Req() request: StaffRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: UpdateOrderStatusDto,
  ) {
    return this.orders.updateStatus(request.user.id, id, input);
  }

  @Post(':id/cancel')
  @AdminPolicy('orders.cancel')
  @HttpCode(200)
  cancel(
    @Req() request: StaffRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: CancelOrderDto,
  ) {
    return this.orders.cancelAdmin(request.user.id, id, input);
  }

  @Post(':id/reject')
  @AdminPolicy('orders.reject')
  @HttpCode(200)
  reject(
    @Req() request: StaffRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: RejectOrderDto,
  ) {
    return this.orders.rejectAdmin(request.user.id, id, input);
  }
}
