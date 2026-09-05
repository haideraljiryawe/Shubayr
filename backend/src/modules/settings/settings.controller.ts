import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
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
