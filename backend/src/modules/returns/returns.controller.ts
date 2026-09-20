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
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import {
  InspectReturnDto,
  RequestReturnDto,
  ReturnQueryDto,
} from './dto/return.dto';
import { ReturnsService } from './returns.service';

type UserRequest = Request & { user: AuthenticatedRequestUser };

@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  listOwned(@Req() request: UserRequest, @Query() query: ReturnQueryDto) {
    return this.returns.listOwned(request.user.id, query);
  }

  @Get('queue')
  @RequirePermissions('returns.view')
  queue(@Query() query: ReturnQueryDto) {
    return this.returns.queue(query);
  }

  @Post()
  request(@Req() request: UserRequest, @Body() input: RequestReturnDto) {
    return this.returns.request(request.user.id, request.user.role, input);
  }

  @Post(':id/inspect')
  @HttpCode(200)
  @RequirePermissions('returns.process')
  inspect(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: InspectReturnDto,
  ) {
    return this.returns.inspect(request.user.id, id, input);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @RequirePermissions('returns.process')
  complete(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
  ) {
    return this.returns.complete(request.user.id, id);
  }
}
