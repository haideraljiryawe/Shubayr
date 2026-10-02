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
import { AdminPolicy } from '../../common/decorators/access-policy.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import {
  AllocateSupplierCreditDto,
  CreateCostCorrectionDto,
  CreatePurchaseInvoiceDto,
  CreateSupplierPaymentDto,
  CreateSupplierReturnDto,
  PurchasingQueryDto,
  StatementQueryDto,
  SupplierDto,
  SupplierOpeningBalanceDto,
  UpdateSupplierDto,
} from './dto/purchasing.dto';
import { PurchasingService } from './purchasing.service';

type AdminRequest = Request & { user: AuthenticatedRequestUser };
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 422 });

@Controller('admin/suppliers')
export class SuppliersController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get()
  @AdminPolicy('suppliers.view')
  list(@Query() query: PurchasingQueryDto) {
    return this.purchasing.listSuppliers(query.page, query.per_page);
  }

  @Get('balances')
  @AdminPolicy('suppliers.view')
  balances() {
    return this.purchasing.balances();
  }

  @Get('aging')
  @AdminPolicy('suppliers.view')
  aging(@Query('as_of') asOf?: string) {
    return this.purchasing.aging(asOf);
  }

  @Post()
  @AdminPolicy('suppliers.manage')
  create(@Req() request: AdminRequest, @Body() input: SupplierDto) {
    return this.purchasing.createSupplier(request.user.id, input);
  }

  @Get(':id')
  @AdminPolicy('suppliers.view')
  get(@Param('id', uuid) id: string) {
    return this.purchasing.supplier(id);
  }

  @Patch(':id')
  @AdminPolicy('suppliers.manage')
  update(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: UpdateSupplierDto,
  ) {
    return this.purchasing.updateSupplier(request.user.id, id, input);
  }

  @Delete(':id')
  @AdminPolicy('suppliers.manage')
  deactivate(@Req() request: AdminRequest, @Param('id', uuid) id: string) {
    return this.purchasing.deactivateSupplier(request.user.id, id);
  }

  @Post(':id/opening-balance')
  @AdminPolicy('supplier_openings.record')
  opening(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: SupplierOpeningBalanceDto,
  ) {
    return this.purchasing.openingBalance(
      request.user.id,
      request.user.permissions,
      id,
      input,
    );
  }

  @Get(':id/statement')
  @AdminPolicy('suppliers.view')
  statement(@Param('id', uuid) id: string, @Query() query: StatementQueryDto) {
    return this.purchasing.statement(id, query);
  }
}

@Controller('admin/purchase-invoices')
export class PurchaseInvoicesController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get()
  @AdminPolicy('suppliers.view')
  list(@Req() request: AdminRequest, @Query() query: PurchasingQueryDto) {
    return this.purchasing.invoices(
      query,
      request.user.permissions.includes('cost.view'),
    );
  }

  @Post()
  @AdminPolicy('purchases.create')
  create(
    @Req() request: AdminRequest,
    @Body() input: CreatePurchaseInvoiceDto,
  ) {
    return this.purchasing.createInvoice(
      request.user.id,
      request.user.permissions,
      input,
    );
  }

  @Get(':id')
  @AdminPolicy('suppliers.view')
  get(@Req() request: AdminRequest, @Param('id', uuid) id: string) {
    return this.purchasing.invoice(
      id,
      request.user.permissions.includes('cost.view'),
    );
  }
}

@Controller('admin/supplier-payments')
export class SupplierPaymentsController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get()
  @AdminPolicy('suppliers.view')
  list(@Query() query: PurchasingQueryDto) {
    return this.purchasing.payments(query);
  }

  @Post()
  @AdminPolicy('supplier_payments.record')
  create(
    @Req() request: AdminRequest,
    @Body() input: CreateSupplierPaymentDto,
  ) {
    return this.purchasing.payment(
      request.user.id,
      request.user.permissions,
      input,
    );
  }
}

@Controller('admin/supplier-credits')
export class SupplierCreditsController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get()
  @AdminPolicy('suppliers.view')
  list(@Query() query: PurchasingQueryDto) {
    return this.purchasing.credits(query);
  }

  @Post(':id/allocations')
  @AdminPolicy('supplier_credits.allocate')
  allocate(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: AllocateSupplierCreditDto,
  ) {
    return this.purchasing.allocateCredit(request.user.id, id, input);
  }
}

@Controller('admin/supplier-returns')
export class SupplierReturnsController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Post()
  @AdminPolicy('supplier_returns.create')
  create(@Req() request: AdminRequest, @Body() input: CreateSupplierReturnDto) {
    return this.purchasing.supplierReturn(
      request.user.id,
      request.user.permissions,
      input,
    );
  }
}

@Controller('admin/purchase-cost-corrections')
export class PurchaseCostCorrectionsController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Post()
  @AdminPolicy('purchases.correct')
  create(@Req() request: AdminRequest, @Body() input: CreateCostCorrectionDto) {
    return this.purchasing.correctCost(
      request.user.id,
      request.user.permissions,
      input,
    );
  }
}
