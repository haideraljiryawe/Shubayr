import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminPolicy } from '../../common/decorators/access-policy.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import {
  ApproveCountDto,
  BalanceQueryDto,
  CountScopeDto,
  CreateLocationDto,
  CreateOpeningDto,
  CreateTransferDto,
  CreateWarehouseDto,
  CreateWriteDownDto,
  LotQueryDto,
  MovementQueryDto,
  PageDto,
  UpdateLocationDto,
  UpdateWarehouseDto,
  CreateRetrievalDto,
  RetrievalQueryDto,
  ReceiveRetrievalDto,
  PrintablePickListsDto,
} from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

type AdminRequest = Request & { user: AuthenticatedRequestUser };
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 422 });

@Controller('admin/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('warehouses')
  @AdminPolicy('inventory.view')
  warehouses() {
    return this.inventory.listWarehouses();
  }

  @Post('warehouses')
  @AdminPolicy('inventory.manage')
  createWarehouse(@Body() input: CreateWarehouseDto) {
    return this.inventory.createWarehouse(input);
  }

  @Patch('warehouses/:id')
  @AdminPolicy('inventory.manage')
  updateWarehouse(
    @Param('id', uuid) id: string,
    @Body() input: UpdateWarehouseDto,
  ) {
    return this.inventory.updateWarehouse(id, input);
  }

  @Delete('warehouses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminPolicy('inventory.manage')
  deleteWarehouse(@Param('id', uuid) id: string) {
    return this.inventory.deleteWarehouse(id);
  }

  @Post('warehouses/:id/locations')
  @AdminPolicy('inventory.manage')
  createLocation(
    @Param('id', uuid) id: string,
    @Body() input: CreateLocationDto,
  ) {
    return this.inventory.createLocation(id, input);
  }

  @Patch('locations/:id')
  @AdminPolicy('inventory.manage')
  updateLocation(
    @Param('id', uuid) id: string,
    @Body() input: UpdateLocationDto,
  ) {
    return this.inventory.updateLocation(id, input);
  }

  @Delete('locations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminPolicy('inventory.manage')
  deleteLocation(@Param('id', uuid) id: string) {
    return this.inventory.deleteLocation(id);
  }

  @Get('balances')
  @AdminPolicy('inventory.view')
  balances(@Query() query: BalanceQueryDto) {
    return this.inventory.balances(query);
  }

  @Get('lots')
  @AdminPolicy('inventory.view')
  lots(@Req() request: AdminRequest, @Query() query: LotQueryDto) {
    return this.inventory.lots(
      query,
      request.user.permissions.includes('cost.view'),
    );
  }

  @Get('lots/:id')
  @AdminPolicy('inventory.view')
  lot(@Req() request: AdminRequest, @Param('id', uuid) id: string) {
    return this.inventory.lot(
      id,
      request.user.permissions.includes('cost.view'),
    );
  }

  @Get('movements')
  @AdminPolicy('inventory.view')
  movements(@Req() request: AdminRequest, @Query() query: MovementQueryDto) {
    return this.inventory.movements(
      query,
      request.user.permissions.includes('cost.view'),
    );
  }

  @Post('openings')
  @AdminPolicy('inventory.manage')
  opening(@Req() request: AdminRequest, @Body() input: CreateOpeningDto) {
    return this.inventory.createOpening(
      request.user.id,
      request.user.permissions,
      input,
    );
  }

  @Get('openings')
  @AdminPolicy('inventory.view')
  openings(@Req() request: AdminRequest, @Query() query: PageDto) {
    return this.inventory.listDocuments(
      'opening',
      query,
      request.user.permissions.includes('cost.view'),
    );
  }

  @Post('transfers')
  @AdminPolicy('inventory.transfer')
  transfer(@Req() request: AdminRequest, @Body() input: CreateTransferDto) {
    return this.inventory.createTransfer(
      request.user.id,
      request.user.permissions,
      input,
    );
  }

  @Get('transfers')
  @AdminPolicy('inventory.view')
  transfers(@Req() request: AdminRequest, @Query() query: PageDto) {
    return this.inventory.listDocuments(
      'transfer',
      query,
      request.user.permissions.includes('cost.view'),
    );
  }

  @Post('counts')
  @AdminPolicy('inventory.count')
  count(@Req() request: AdminRequest, @Body() input: CountScopeDto) {
    return this.inventory.createCount(request.user.id, input);
  }

  @Get('counts')
  @AdminPolicy('inventory.view')
  counts(@Req() request: AdminRequest, @Query() query: PageDto) {
    return this.inventory.listDocuments(
      'count',
      query,
      request.user.permissions.includes('cost.view'),
    );
  }

  @Post('counts/:id/approve')
  @AdminPolicy('inventory.adjust')
  approveCount(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: ApproveCountDto,
  ) {
    return this.inventory.approveCount(
      request.user.id,
      request.user.permissions,
      id,
      input,
    );
  }

  @Post('write-downs')
  @AdminPolicy('inventory.write_down')
  writeDown(@Req() request: AdminRequest, @Body() input: CreateWriteDownDto) {
    return this.inventory.createWriteDown(
      request.user.id,
      request.user.permissions,
      input,
    );
  }

  @Get('write-downs')
  @AdminPolicy('inventory.view')
  writeDowns(@Req() request: AdminRequest, @Query() query: PageDto) {
    return this.inventory.listDocuments(
      'write_down',
      query,
      request.user.permissions.includes('cost.view'),
    );
  }

  @Get('documents/:type/:id')
  @AdminPolicy('inventory.view')
  document(
    @Req() request: AdminRequest,
    @Param('type') type: string,
    @Param('id', uuid) id: string,
  ) {
    return this.inventory.getDocument(
      type,
      id,
      request.user.permissions.includes('cost.view'),
    );
  }
}

@Controller('admin')
export class RetrievalController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('retrievals')
  @AdminPolicy('retrieval.view')
  list(@Query() query: RetrievalQueryDto) {
    return this.inventory.listRetrievals(query);
  }

  @Post('orders/:id/retrievals')
  @AdminPolicy('retrieval.open')
  open(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: CreateRetrievalDto,
  ) {
    return this.inventory.createRetrieval(
      request.user.id,
      id,
      input,
      request.user.permissions.includes('cost.view'),
    );
  }

  @Get('retrievals/:id')
  @AdminPolicy('retrieval.view')
  detail(@Req() request: AdminRequest, @Param('id', uuid) id: string) {
    return this.inventory.getRetrieval(
      id,
      request.user.permissions.includes('cost.view'),
    );
  }

  @Post('retrievals/:id/receive')
  @HttpCode(HttpStatus.OK)
  @AdminPolicy('retrieval.receive')
  receive(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: ReceiveRetrievalDto,
  ) {
    return this.inventory.receiveRetrieval(
      request.user.id,
      id,
      input,
      request.user.permissions.includes('cost.view'),
    );
  }
}

@Controller('admin')
export class PickListsController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('orders/:id/pick-list')
  @AdminPolicy('inventory.pick')
  orderPickList(@Param('id', uuid) id: string) {
    return this.inventory.getOrderPickList(id);
  }

  @Post('pick-lists/print')
  @AdminPolicy('inventory.pick')
  printable(@Body() input: PrintablePickListsDto) {
    return this.inventory.printablePickLists(input.order_ids);
  }
}
