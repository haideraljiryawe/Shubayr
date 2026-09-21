import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import {
  AdjustPointsDto,
  LoyaltyQueryDto,
  RedeemPointsDto,
} from './dto/loyalty.dto';
import { LoyaltyService } from './loyalty.service';

type UserRequest = Request & { user: AuthenticatedRequestUser };

@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get()
  own(@Req() request: UserRequest, @Query() query: LoyaltyQueryDto) {
    if (request.user.role !== 'customer')
      throw new ForbiddenException('Customer account required');
    return this.loyalty.own(request.user.id, query);
  }

  @Post('redeem')
  redeem(@Req() request: UserRequest, @Body() input: RedeemPointsDto) {
    if (request.user.role !== 'customer')
      throw new ForbiddenException('Customer account required');
    return this.loyalty.redeem(request.user.id, input);
  }
}

@RequirePermissions('loyalty.manage')
@Controller('admin/loyalty')
export class AdminLoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get(':userId')
  customer(
    @Param('userId', new ParseUUIDPipe({ errorHttpStatusCode: 422 }))
    userId: string,
    @Query() query: LoyaltyQueryDto,
  ) {
    return this.loyalty.staff(userId, query);
  }

  @Post(':userId/adjust')
  adjust(
    @Req() request: UserRequest,
    @Param('userId', new ParseUUIDPipe({ errorHttpStatusCode: 422 }))
    userId: string,
    @Body() input: AdjustPointsDto,
  ) {
    return this.loyalty.adjust(request.user.id, userId, input);
  }
}
