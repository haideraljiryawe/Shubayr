import {
  Body,
  Controller,
  Get,
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
  AppPolicy,
} from '../../common/decorators/access-policy.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { DeliveriesService } from './deliveries.service';
import { AssignedDeliveriesQueryDto } from './dto/assigned-deliveries-query.dto';
import {
  AssignDeliveryDto,
  CreateDeliveryRatingDto,
  UpdateDeliveryStatusDto,
} from './dto/delivery.dto';

type AuthenticatedRequest = Request & { user: AuthenticatedRequestUser };

@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get()
  @AdminPolicy('deliveries.manage')
  listAll(@Query() query: AssignedDeliveriesQueryDto) {
    return this.deliveries.listAll(query);
  }

  @Get('assigned')
  @AppPolicy('delivery_agent')
  listAssigned(
    @Req() request: AuthenticatedRequest,
    @Query() query: AssignedDeliveriesQueryDto,
  ) {
    return this.deliveries.listAssigned(request.user.id, query);
  }

  @Patch(':id/assign')
  @AdminPolicy('orders.assign_agent')
  assign(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: AssignDeliveryDto,
  ) {
    return this.deliveries.assign(request.user.id, id, input);
  }

  @Patch(':id')
  @AppPolicy('delivery_agent')
  updateStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: UpdateDeliveryStatusDto,
  ) {
    return this.deliveries.updateStatus(request.user.id, id, input);
  }

  @Post(':id/rating')
  @AppPolicy('customer')
  rate(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: CreateDeliveryRatingDto,
  ) {
    return this.deliveries.rate(request.user.id, request.user.role!, id, input);
  }
}
