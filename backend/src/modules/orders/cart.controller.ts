import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { AppPolicy } from '../../common/decorators/access-policy.decorator';
import { CartService } from './cart.service';
import {
  AddCartItemDto,
  MergeCartDto,
  UpdateCartItemDto,
  ValidateCouponDto,
} from './dto/cart.dto';
import {
  RateLimitRisk,
  RateLimitTier,
} from '../../common/rate-limit/rate-limit-tier';

type AuthenticatedRequest = Request & { user: AuthenticatedRequestUser };

@AppPolicy('customer')
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest) {
    return this.cart.get(request.user.id);
  }

  @Post('items')
  @HttpCode(200)
  @RateLimitTier(RateLimitRisk.Strict)
  add(
    @Req() request: AuthenticatedRequest,
    @Body() input: AddCartItemDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.cart.add(request.user.id, input, key);
  }

  @Post('merge')
  @HttpCode(200)
  @RateLimitTier(RateLimitRisk.Strict)
  merge(
    @Req() request: AuthenticatedRequest,
    @Body() input: MergeCartDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.cart.merge(request.user.id, input, key);
  }

  @Patch('items/:id')
  @RateLimitTier(RateLimitRisk.Strict)
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: UpdateCartItemDto,
  ) {
    return this.cart.update(request.user.id, id, input);
  }

  @Delete('items/:id')
  @HttpCode(204)
  @RateLimitTier(RateLimitRisk.Strict)
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.cart.remove(request.user.id, id);
  }

  @Delete('coupon')
  @RateLimitTier(RateLimitRisk.Strict)
  removeCoupon(@Req() request: AuthenticatedRequest) {
    return this.cart.removeCoupon(request.user.id);
  }
}

@AppPolicy('customer')
@Controller('coupons')
export class CouponController {
  constructor(private readonly cart: CartService) {}

  @Post('validate')
  @HttpCode(200)
  @RateLimitTier(RateLimitRisk.Strict)
  validate(
    @Req() request: AuthenticatedRequest,
    @Body() input: ValidateCouponDto,
  ) {
    return this.cart.applyCoupon(request.user.id, input);
  }
}
