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
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminPolicy } from '../../common/decorators/access-policy.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { AccessManagementService } from './access-management.service';
import {
  CreatePresetDto,
  CreateStaffDto,
  ReasonDto,
  RegisterWorkPhoneDto,
  SetStaffAccessDto,
  SetStaffPasswordDto,
  UpdatePresetDto,
  UpdateStaffDto,
} from './dto/access.dto';

type AdminRequest = Request & { user: AuthenticatedRequestUser };
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 422 });

@Controller('admin/staff')
@AdminPolicy('users.manage')
export class StaffController {
  constructor(private readonly access: AccessManagementService) {}

  @Get()
  list() {
    return this.access.listStaff();
  }

  @Post()
  create(@Req() request: AdminRequest, @Body() input: CreateStaffDto) {
    return this.access.createStaff(request.user.id, input);
  }

  @Patch(':id')
  update(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: UpdateStaffDto,
  ) {
    return this.access.updateStaff(request.user.id, id, input);
  }

  @Post(':id/password')
  setPassword(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: SetStaffPasswordDto,
  ) {
    return this.access.setPassword(request.user.id, id, input);
  }

  @Put(':id/access')
  setAccess(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: SetStaffAccessDto,
  ) {
    return this.access.setAccess(request.user.id, id, input);
  }
}

@Controller('admin/presets')
@AdminPolicy('roles.manage')
export class PresetsController {
  constructor(private readonly access: AccessManagementService) {}

  @Get()
  list() {
    return this.access.listPresets();
  }

  @Post()
  create(@Req() request: AdminRequest, @Body() input: CreatePresetDto) {
    return this.access.createPreset(request.user.id, input);
  }

  @Patch(':id')
  update(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: UpdatePresetDto,
  ) {
    return this.access.updatePreset(request.user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Query() input: ReasonDto,
  ) {
    return this.access.deletePreset(request.user.id, id, input.reason);
  }
}

@Controller('admin/permissions')
@AdminPolicy('roles.manage')
export class PermissionsController {
  constructor(private readonly access: AccessManagementService) {}

  @Get()
  list() {
    return this.access.permissions();
  }
}

@Controller('admin/work-phones')
@AdminPolicy('users.manage')
export class WorkPhonesController {
  constructor(private readonly access: AccessManagementService) {}

  @Get()
  list() {
    return this.access.listWorkPhones();
  }

  @Post()
  register(@Req() request: AdminRequest, @Body() input: RegisterWorkPhoneDto) {
    return this.access.registerWorkPhone(request.user.id, input);
  }

  @Delete(':phone')
  @HttpCode(204)
  revoke(
    @Req() request: AdminRequest,
    @Param('phone') phone: string,
    @Query() input: ReasonDto,
  ) {
    return this.access.revokeWorkPhone(request.user.id, phone, input.reason);
  }
}
