import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { CartService } from './cart.service';
import {
  AddCartItemDto,
  UpdateCartItemDto,
  ValidateCouponDto,
} from './dto/cart.dto';

type AuthenticatedRequest = Request & { user: AuthenticatedRequestUser };

@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest) {
    return this.cart.get(request.user.id);
  }

  @Post('items')
  @HttpCode(200)
  add(@Req() request: AuthenticatedRequest, @Body() input: AddCartItemDto) {
    return this.cart.add(request.user.id, input);
  }

  @Patch('items/:id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: UpdateCartItemDto,
  ) {
    return this.cart.update(request.user.id, id, input);
  }

  @Delete('items/:id')
  @HttpCode(204)
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.cart.remove(request.user.id, id);
  }
}

@Controller('coupons')
export class CouponController {
  constructor(private readonly cart: CartService) {}

  @Post('validate')
  @HttpCode(200)
  validate(
    @Req() request: AuthenticatedRequest,
    @Body() input: ValidateCouponDto,
  ) {
    return this.cart.applyCoupon(request.user.id, input);
  }
}
