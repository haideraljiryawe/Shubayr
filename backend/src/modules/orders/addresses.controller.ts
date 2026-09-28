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
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { AppPolicy } from '../../common/decorators/access-policy.decorator';
import { AddressesService } from './addresses.service';
import {
  AddressCreateDto,
  AddressPatchDto,
  AddressQueryDto,
} from './dto/address-write.dto';

type UserRequest = Request & { user: AuthenticatedRequestUser };

@AppPolicy('customer')
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@Req() request: UserRequest, @Query() query: AddressQueryDto) {
    return this.addresses.list(request.user.id, query);
  }

  @Post()
  create(@Req() request: UserRequest, @Body() input: AddressCreateDto) {
    return this.addresses.create(request.user.id, input);
  }

  @Get(':id')
  get(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
  ) {
    return this.addresses.get(request.user.id, id);
  }

  @Patch(':id')
  update(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: AddressPatchDto,
  ) {
    return this.addresses.update(request.user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
  ) {
    return this.addresses.remove(request.user.id, id);
  }
}
