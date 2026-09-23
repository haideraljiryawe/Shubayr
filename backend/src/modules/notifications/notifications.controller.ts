import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Patch,
  Query,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { NotificationsService } from './notifications.service';
import {
  NotificationHistoryQueryDto,
  PatchPreferencesDto,
  RegisterDeviceDto,
  UnregisterDeviceDto,
} from './dto/notification.dto';

type UserRequest = Request & { user: AuthenticatedRequestUser };

@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('devices/token')
  register(@Req() request: UserRequest, @Body() input: RegisterDeviceDto) {
    return this.notifications.register(request.user.id, input);
  }

  @Delete('devices/token')
  @HttpCode(204)
  unregister(
    @Req() request: UserRequest,
    @Query('token') queryToken?: string,
    @Body() body?: UnregisterDeviceDto,
  ) {
    const token = queryToken ?? body?.token;
    if (!token)
      throw new UnprocessableEntityException('Device token is required');
    return this.notifications.unregister(request.user.id, token);
  }

  @Get('me/notification-preferences')
  preferences(@Req() request: UserRequest) {
    return this.notifications.preferences(request.user.id);
  }

  @Patch('me/notification-preferences')
  patchPreferences(
    @Req() request: UserRequest,
    @Body() input: PatchPreferencesDto,
  ) {
    return this.notifications.patchPreferences(request.user.id, input);
  }

  @Get('me/notifications')
  history(
    @Req() request: UserRequest,
    @Query() query: NotificationHistoryQueryDto,
  ) {
    return this.notifications.history(request.user.id, query);
  }
}
