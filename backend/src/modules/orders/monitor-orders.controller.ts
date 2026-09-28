import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { AppPolicy } from '../../common/decorators/access-policy.decorator';
import { MonitorOrderQueryDto } from './dto/order.dto';
import { OrdersService } from './orders.service';

@AppPolicy('order_monitor')
@Controller('monitor/orders')
export class MonitorOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: MonitorOrderQueryDto) {
    return this.orders.listMonitor(query);
  }

  @Get(':id')
  detail(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
  ) {
    return this.orders.getMonitor(id);
  }
}
