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
  Res,
  Param,
  ParseUUIDPipe,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { AnySessionPolicy } from '../../common/decorators/access-policy.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { NotificationsService } from './notifications.service';
import { NotificationStreamService } from './notification-stream.service';
import {
  NotificationHistoryQueryDto,
  PatchPreferencesDto,
  RegisterDeviceDto,
  NotificationStreamQueryDto,
  UnregisterDeviceDto,
} from './dto/notification.dto';

type UserRequest = Request & { user: AuthenticatedRequestUser };

@AnySessionPolicy()
@Controller()
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly stream: NotificationStreamService,
  ) {}

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

  @Get('me/notifications/unread-count')
  unreadCount(@Req() request: UserRequest) {
    return this.notifications.unreadCount(request.user.id);
  }

  @Patch('me/notifications/read-all')
  markAllRead(@Req() request: UserRequest) {
    return this.notifications.markAllRead(request.user.id);
  }

  @Patch('me/notifications/:id/read')
  markRead(
    @Req() request: UserRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
  ) {
    return this.notifications.markRead(request.user.id, id);
  }

  @Post('notifications/stream-ticket')
  streamTicket(@Req() request: UserRequest) {
    return this.stream.issue(request.user);
  }

  @Public()
  @Get('notifications/stream')
  streamNotifications(
    @Query() query: NotificationStreamQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const lastEventId = request.header('last-event-id');
    return this.stream.open(query.ticket, lastEventId ?? query.since, response);
  }
}
