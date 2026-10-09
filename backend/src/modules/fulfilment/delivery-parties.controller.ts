import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  AdminAnyPermissionPolicy,
  AdminPolicy,
  AppPolicy,
} from '../../common/decorators/access-policy.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { DeliveryPartiesService } from './delivery-parties.service';
import { DeliveriesService } from './deliveries.service';
import { PartyCollectionsQueryDto } from './dto/delivery.dto';
import {
  CreateExternalDriverDto,
  CustodyOverviewQueryDto,
  DeliveryPartyKind,
  DeliveryPartyQueryDto,
  PartyCashActivityQueryDto,
  PartyStatementQueryDto,
  UpdateExternalDriverDto,
} from './dto/delivery-party.dto';

type AdminRequest = Request & { user: AuthenticatedRequestUser };
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 422 });

@Controller('deliveries')
export class AgentCustodyController {
  constructor(private readonly parties: DeliveryPartiesService) {}

  @Get('custody')
  @AppPolicy('delivery_agent')
  custody(@Req() request: AdminRequest) {
    return this.parties.custodyForUser(request.user.id);
  }
}

@Controller('admin/delivery-parties')
export class DeliveryPartiesController {
  constructor(
    private readonly parties: DeliveryPartiesService,
    private readonly deliveries: DeliveriesService,
  ) {}

  @Get()
  @AdminAnyPermissionPolicy(
    'deliveries.manage',
    'orders.assign_agent',
    'drivers.manage',
  )
  list(@Req() request: AdminRequest, @Query() query: DeliveryPartyQueryDto) {
    return this.parties.list(
      query,
      request.user.permissions.includes('cost.view'),
    );
  }

  @Get('custody-overview')
  @AdminPolicy('deliveries.manage')
  overview(
    @Req() request: AdminRequest,
    @Query() query: CustodyOverviewQueryDto,
  ) {
    return this.parties.custodyOverview(
      query,
      request.user.permissions.includes('cost.view'),
    );
  }

  @Get(':id')
  @AdminPolicy('deliveries.manage')
  get(@Param('id', uuid) id: string) {
    return this.parties.get(id);
  }

  @Get(':id/custody')
  @AdminPolicy('deliveries.manage')
  custody(@Req() request: AdminRequest, @Param('id', uuid) id: string) {
    return this.parties.custody(
      id,
      request.user.permissions.includes('cost.view'),
    );
  }

  @Get(':id/statement')
  @AdminPolicy('deliveries.manage')
  statement(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Query() query: PartyStatementQueryDto,
  ) {
    return this.parties.statement(
      id,
      query,
      request.user.permissions.includes('cost.view'),
    );
  }

  @Get(':id/cash-activity')
  @AdminPolicy('deliveries.manage')
  cashActivity(
    @Param('id', uuid) id: string,
    @Query() query: PartyCashActivityQueryDto,
  ) {
    return this.parties.cashActivity(id, query);
  }

  @Get(':id/orders')
  @AdminPolicy('deliveries.manage')
  heldOrders(@Param('id', uuid) id: string) {
    return this.parties.heldOrders(id);
  }

  @Get(':id/collections')
  @AdminPolicy('deliveries.manage')
  collections(
    @Param('id', uuid) id: string,
    @Query() query: PartyCollectionsQueryDto,
  ) {
    return this.deliveries.listPartyCollections(id, query);
  }
}

@Controller('admin/external-drivers')
export class ExternalDriversController {
  constructor(private readonly parties: DeliveryPartiesService) {}

  @Get()
  @AdminPolicy('drivers.manage')
  list(@Req() request: AdminRequest, @Query() query: DeliveryPartyQueryDto) {
    return this.parties.list(
      {
        ...query,
        kind: DeliveryPartyKind.ExternalDriver,
      },
      request.user.permissions.includes('cost.view'),
    );
  }

  @Post()
  @AdminPolicy('drivers.manage')
  create(@Req() request: AdminRequest, @Body() input: CreateExternalDriverDto) {
    return this.parties.createExternal(request.user.id, input);
  }

  @Patch(':id')
  @AdminPolicy('drivers.manage')
  update(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: UpdateExternalDriverDto,
  ) {
    return this.parties.updateExternal(request.user.id, id, input);
  }

  @Delete(':id')
  @AdminPolicy('drivers.manage')
  remove(@Req() request: AdminRequest, @Param('id', uuid) id: string) {
    return this.parties.removeExternal(request.user.id, id);
  }
}
