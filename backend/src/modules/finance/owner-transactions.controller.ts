import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminPolicy } from '../../common/decorators/access-policy.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import {
  CreateOwnerTransactionDto,
  OwnerTransactionQueryDto,
  PostOwnerTransactionDto,
  ReverseOwnerTransactionDto,
} from './dto/owner-transaction.dto';
import { OwnerTransactionsService } from './owner-transactions.service';

type AdminRequest = Request & { user: AuthenticatedRequestUser };
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 422 });

@Controller('admin/owner-transactions')
export class OwnerTransactionsController {
  constructor(private readonly ownerTransactions: OwnerTransactionsService) {}

  @Post()
  @AdminPolicy('owner_transactions.create')
  create(
    @Req() request: AdminRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateOwnerTransactionDto,
  ) {
    return this.ownerTransactions.create(request.user, key, input);
  }

  @Get()
  @AdminPolicy('owner_transactions.read')
  list(@Query() query: OwnerTransactionQueryDto) {
    return this.ownerTransactions.list(query);
  }

  @Get(':id')
  @AdminPolicy('owner_transactions.read')
  get(@Param('id', uuid) id: string) {
    return this.ownerTransactions.get(id);
  }

  @Post(':id/post')
  @HttpCode(200)
  @AdminPolicy('owner_transactions.post')
  post(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: PostOwnerTransactionDto,
  ) {
    return this.ownerTransactions.post(request.user, id, key, input);
  }

  @Post(':id/reverse')
  @HttpCode(200)
  @AdminPolicy('owner_transactions.reverse')
  reverse(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: ReverseOwnerTransactionDto,
  ) {
    return this.ownerTransactions.reverse(request.user, id, key, input);
  }
}
