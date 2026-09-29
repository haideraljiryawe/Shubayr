import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AdminPolicy } from '../../common/decorators/access-policy.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { AdminSettingsUpdateDto } from './dto/admin-settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get()
  getPublicSettings(): Promise<Record<string, string>> {
    return this.settings.getPublicSettings();
  }
}

@Controller('admin/settings')
@AdminPolicy('settings.manage')
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.getAdminSettings();
  }

  @Put()
  update(
    @Req() request: Request & { user: AuthenticatedRequestUser },
    @Body() input: AdminSettingsUpdateDto,
  ) {
    return this.settings.updateAdminSettings(request.user.id, input);
  }
}
