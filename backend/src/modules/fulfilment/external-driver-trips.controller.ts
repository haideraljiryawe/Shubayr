import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminPolicy } from '../../common/decorators/access-policy.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import {
  AddExternalDriverTripOrderDto,
  CloseExternalDriverTripDto,
  CreateExternalDriverTripDto,
  ExternalDriverTripQueryDto,
  ExternalDriverTripDeliveredDto,
  ExternalDriverTripDoorReturnDto,
  ExternalDriverTripFailedDto,
  ExternalDriverTripLossDto,
  StartExternalDriverTripDto,
} from './dto/external-driver-trip.dto';
import { ExternalDriverTripsService } from './external-driver-trips.service';

type AdminRequest = Request & { user: AuthenticatedRequestUser };
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 422 });

@Controller('admin/external-driver-trips')
export class ExternalDriverTripsController {
  constructor(private readonly trips: ExternalDriverTripsService) {}

  @Get()
  @AdminPolicy('trips.view')
  list(@Query() query: ExternalDriverTripQueryDto) {
    return this.trips.list(query);
  }

  @Get(':id')
  @AdminPolicy('trips.view')
  get(@Param('id', uuid) id: string) {
    return this.trips.get(id);
  }

  @Get(':id/close-preview')
  @AdminPolicy('trips.settle')
  closePreview(@Param('id', uuid) id: string) {
    return this.trips.closePreview(id);
  }

  @Post()
  @AdminPolicy('trips.manage')
  create(
    @Req() request: AdminRequest,
    @Body() input: CreateExternalDriverTripDto,
  ) {
    return this.trips.create(request.user, input);
  }

  @Post(':id/orders')
  @AdminPolicy('trips.manage')
  addOrder(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: AddExternalDriverTripOrderDto,
  ) {
    return this.trips.addOrder(request.user, id, input);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @AdminPolicy('trips.manage')
  start(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: StartExternalDriverTripDto,
  ) {
    return this.trips.start(request.user, id, input);
  }

  @Post(':id/orders/:orderId/delivered')
  @HttpCode(HttpStatus.OK)
  @AdminPolicy('orders.deliver')
  delivered(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Param('orderId', uuid) orderId: string,
    @Body() input: ExternalDriverTripDeliveredDto,
  ) {
    return this.trips.recordDelivered(request.user, id, orderId, input);
  }

  @Post(':id/orders/:orderId/failed')
  @HttpCode(HttpStatus.OK)
  @AdminPolicy('orders.fail')
  failed(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Param('orderId', uuid) orderId: string,
    @Body() input: ExternalDriverTripFailedDto,
  ) {
    return this.trips.recordFailed(request.user, id, orderId, input);
  }

  @Post(':id/orders/:orderId/return-at-door')
  @AdminPolicy('custody_exceptions.return_uncollected')
  returnAtDoor(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Param('orderId', uuid) orderId: string,
    @Body() input: ExternalDriverTripDoorReturnDto,
  ) {
    return this.trips.recordDoorReturn(request.user, id, orderId, input);
  }

  @Post(':id/orders/:orderId/lost')
  @AdminPolicy('custody_exceptions.loss')
  lost(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Param('orderId', uuid) orderId: string,
    @Body() input: ExternalDriverTripLossDto,
  ) {
    return this.trips.recordLoss(request.user, id, orderId, input);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @AdminPolicy('trips.settle')
  close(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: CloseExternalDriverTripDto,
  ) {
    return this.trips.close(request.user, id, input);
  }
}
