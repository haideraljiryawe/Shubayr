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
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import {
  AdminOrderQueryDto,
  CancelOrderDto,
  UpdateOrderStatusDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';

type StaffRequest = Request & { user: AuthenticatedRequestUser };

@Controller('admin/orders')
@RequirePermissions('orders.manage')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: AdminOrderQueryDto) {
    return this.orders.listAdmin(query);
  }

  @Get(':id')
  detail(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
  ) {
    return this.orders.getAdmin(id);
  }

  @Patch(':id/status')
  status(
    @Req() request: StaffRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: UpdateOrderStatusDto,
  ) {
    return this.orders.updateStatus(request.user.id, id, input);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @Req() request: StaffRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: CancelOrderDto,
  ) {
    return this.orders.cancelAdmin(request.user.id, id, input);
  }
}
