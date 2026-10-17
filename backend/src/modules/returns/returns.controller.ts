import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
import {
  ApproveReturnDto,
  InspectReturnDto,
  ReceiveReturnDto,
  RefundReturnDto,
  RequestReturnDto,
  ReturnQueryDto,
  StaffCreateReturnDto,
} from './dto/return.dto';
import { ReturnsService } from './returns.service';

type UserRequest = Request & { user: AuthenticatedRequestUser };

@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @AppPolicy('customer')
  listOwned(@Req() request: UserRequest, @Query() query: ReturnQueryDto) {
    return this.returns.listOwned(request.user.id, query);
  }

  @Get('queue')
  @AdminPolicy('returns.view')
  queue(@Query() query: ReturnQueryDto) {
    return this.returns.queue(query);
  }

  @Get('queue/:id')
  @AdminPolicy('returns.view')
  getStaff(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
  ) {
    return this.returns.getStaff(id);
  }

  @Post('staff')
  @AdminPolicy('returns.create')
  createStaff(
    @Req() request: UserRequest,
    @Body() input: StaffCreateReturnDto,
  ) {
    return this.returns.createStaff(
      { id: request.user.id, permissions: request.user.permissions },
      input,
    );
  }

  @Post()
  @AppPolicy('customer')
  request(@Req() request: UserRequest, @Body() input: RequestReturnDto) {
    return this.returns.request(request.user.id, request.user.role!, input);
  }

  @Get(':id')
  @AppPolicy('customer')
  getOwned(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
  ) {
    return this.returns.getOwned(request.user.id, id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @AdminPolicy('returns.approve')
  approve(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: ApproveReturnDto,
  ) {
    return this.returns.approve(
      { id: request.user.id, permissions: request.user.permissions },
      id,
      input,
    );
  }

  @Post(':id/receive')
  @HttpCode(200)
  @AdminPolicy('returns.receive')
  receive(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: ReceiveReturnDto,
  ) {
    return this.returns.receive(
      { id: request.user.id, permissions: request.user.permissions },
      id,
      input,
    );
  }

  @Post(':id/inspect')
  @HttpCode(200)
  @AdminPolicy('returns.inspect')
  inspect(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: InspectReturnDto,
  ) {
    return this.returns.inspect(
      { id: request.user.id, permissions: request.user.permissions },
      id,
      input,
    );
  }

  @Post(':id/refund')
  @HttpCode(200)
  @AdminPolicy('returns.refund')
  refund(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: RefundReturnDto,
  ) {
    return this.returns.refund(
      { id: request.user.id, permissions: request.user.permissions },
      id,
      input,
    );
  }
}
