import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { DeliveriesService } from './deliveries.service';
import { AssignedDeliveriesQueryDto } from './dto/assigned-deliveries-query.dto';

type AuthenticatedRequest = Request & { user: AuthenticatedRequestUser };

@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get('assigned')
  @RequirePermissions('delivery.assigned')
  listAssigned(
    @Req() request: AuthenticatedRequest,
    @Query() query: AssignedDeliveriesQueryDto,
  ) {
    return this.deliveries.listAssigned(request.user.id, query);
  }
}
