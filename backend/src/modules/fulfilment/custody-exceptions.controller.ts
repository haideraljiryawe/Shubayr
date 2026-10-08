import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminPolicy } from '../../common/decorators/access-policy.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { CustodyExceptionsService } from './custody-exceptions.service';
import {
  CreateDeliveryFeeRefundDto,
  CreateGoodsCustodyExceptionDto,
  CreateReturnAgainstUncollectedDto,
  CustodyExceptionQueryDto,
  ReverseCustodyExceptionDto,
} from './dto/custody-exception.dto';

type AdminRequest = Request & { user: AuthenticatedRequestUser };
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 422 });

@Controller('admin/custody-exceptions')
export class CustodyExceptionsController {
  constructor(private readonly exceptions: CustodyExceptionsService) {}

  @Get()
  @AdminPolicy('custody_exceptions.view')
  list(@Req() request: AdminRequest, @Query() query: CustodyExceptionQueryDto) {
    return this.exceptions.list(query, request.user.permissions);
  }

  @Get(':id')
  @AdminPolicy('custody_exceptions.view')
  get(@Req() request: AdminRequest, @Param('id', uuid) id: string) {
    return this.exceptions.get(id, request.user.permissions);
  }

  @Post('goods-loss')
  @AdminPolicy('custody_exceptions.loss')
  goodsLoss(
    @Req() request: AdminRequest,
    @Body() input: CreateGoodsCustodyExceptionDto,
  ) {
    return this.exceptions.recordGoodsLoss(request.user, input);
  }

  @Post('return-against-uncollected')
  @AdminPolicy('custody_exceptions.return_uncollected')
  returnAgainstUncollected(
    @Req() request: AdminRequest,
    @Body() input: CreateReturnAgainstUncollectedDto,
  ) {
    return this.exceptions.recordReturn(request.user, input);
  }

  @Post('delivery-fee-refund')
  @AdminPolicy('custody_exceptions.refund_delivery_fee')
  deliveryFeeRefund(
    @Req() request: AdminRequest,
    @Body() input: CreateDeliveryFeeRefundDto,
  ) {
    return this.exceptions.refundDeliveryFee(request.user, input);
  }

  @Post(':id/reversal')
  @AdminPolicy('custody_exceptions.reverse')
  reverse(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: ReverseCustodyExceptionDto,
  ) {
    return this.exceptions.reverse(request.user, id, input);
  }
}
