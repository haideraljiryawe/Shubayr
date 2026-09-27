import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { AddWishlistItemDto, WishlistQueryDto } from './dto/wishlist.dto';
import { WishlistService } from './wishlist.service';

type UserRequest = Request & { user: AuthenticatedRequestUser };

@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  list(@Req() request: UserRequest, @Query() query: WishlistQueryDto) {
    return this.wishlist.list(request.user.id, request.user.role, query);
  }

  @Post()
  add(@Req() request: UserRequest, @Body() input: AddWishlistItemDto) {
    return this.wishlist.add(
      request.user.id,
      request.user.role,
      input.product_id,
    );
  }

  @Delete(':productId')
  @HttpCode(204)
  remove(
    @Req() request: UserRequest,
    @Param('productId', new ParseUUIDPipe({ errorHttpStatusCode: 422 }))
    productId: string,
  ) {
    return this.wishlist.remove(request.user.id, request.user.role, productId);
  }
}
