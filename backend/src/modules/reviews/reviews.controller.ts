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
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AppPolicy } from '../../common/decorators/access-policy.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import {
  CreateReviewDto,
  EditReviewDto,
  ModerateReviewDto,
  ReviewPageQueryDto,
  ReviewQueryDto,
} from './dto/review.dto';
import { ReviewsService } from './reviews.service';
import {
  RateLimitRisk,
  RateLimitTier,
} from '../../common/rate-limit/rate-limit-tier';

type UserRequest = Request & { user: AuthenticatedRequestUser };
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 422 });

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @RateLimitTier(RateLimitRisk.Catalog)
  @Get('products/:id/reviews')
  list(@Param('id', uuid) id: string, @Query() query: ReviewQueryDto) {
    return this.reviews.publicList(id, query);
  }

  @Post('products/:id/reviews')
  @AppPolicy('customer')
  create(
    @Req() request: UserRequest,
    @Param('id', uuid) id: string,
    @Body() input: CreateReviewDto,
  ) {
    return this.reviews.create(request.user.id, request.user.role!, id, input);
  }

  @Get('me/reviews')
  @AppPolicy('customer')
  mine(@Req() request: UserRequest, @Query() query: ReviewPageQueryDto) {
    return this.reviews.mine(request.user.id, request.user.role!, query);
  }

  @Patch('reviews/:id')
  @AppPolicy('customer')
  edit(
    @Req() request: UserRequest,
    @Param('id', uuid) id: string,
    @Body() input: EditReviewDto,
  ) {
    return this.reviews.edit(request.user.id, request.user.role!, id, input);
  }

  @Delete('reviews/:id')
  @AppPolicy('customer')
  @HttpCode(204)
  delete(@Req() request: UserRequest, @Param('id', uuid) id: string) {
    return this.reviews.delete(request.user.id, request.user.role!, id);
  }
}

@RequirePermissions('reviews.moderate')
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  queue(@Query() query: ReviewQueryDto) {
    return this.reviews.queue(query);
  }

  @Post(':id/moderate')
  @HttpCode(200)
  moderate(
    @Req() request: UserRequest,
    @Param('id', uuid) id: string,
    @Body() input: ModerateReviewDto,
  ) {
    return this.reviews.moderate(request.user.id, id, input);
  }
}
