import { Body, Controller, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { UserSelfUpdateDto } from './dto/user-self-update.dto';
import { MeService } from './me.service';

type AuthenticatedRequest = Request & { user: AuthenticatedRequestUser };

@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Patch()
  updateCurrentUser(
    @Req() request: AuthenticatedRequest,
    @Body() input: UserSelfUpdateDto,
  ) {
    return this.me.updateCurrentUser(request.user.id, input);
  }
}
