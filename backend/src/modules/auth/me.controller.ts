import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { UserSelfUpdateDto } from './dto/user-self-update.dto';
import { MeService } from './me.service';

type AuthenticatedRequest = Request & { user: AuthenticatedRequestUser };

@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  getCurrentUser(@Req() request: AuthenticatedRequest) {
    return this.me.getCurrentUser(request.user.id);
  }

  @Patch()
  updateCurrentUser(
    @Req() request: AuthenticatedRequest,
    @Body() input: UserSelfUpdateDto,
  ) {
    return this.me.updateCurrentUser(request.user.id, input);
  }
}
