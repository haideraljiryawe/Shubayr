import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AdminAnyPermissionPolicy,
  AdminPolicy,
} from '../../common/decorators/access-policy.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { ReportExportService } from './report-export.service';
import {
  AsOfReportQueryDto,
  CreateReportExportDto,
  InventoryValuationQueryDto,
  ExpenseReportQueryDto,
  PeriodReportQueryDto,
  ProfitabilityReportQueryDto,
  ProfitLossQueryDto,
  PurchasesReportQueryDto,
  SalesReportQueryDto,
  StockMovementReportQueryDto,
  SupplierStatementQueryDto,
} from './reports.dto';
import { ReportsService } from './reports.service';
import { ReportsPart2Service } from './reports-part2.service';
import { ReportsPart3Service } from './reports-part3.service';

type AdminRequest = Request & { user: AuthenticatedRequestUser };
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 422 });

@Controller('admin/reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly reportsPart2: ReportsPart2Service,
    private readonly reportsPart3: ReportsPart3Service,
    private readonly exports: ReportExportService,
  ) {}

  @Get('purchases')
  @AdminPolicy('reports.purchases.read', 'cost.view')
  purchases(
    @Req() request: AdminRequest,
    @Query() query: PurchasesReportQueryDto,
  ) {
    return this.reportsPart3.purchases(request.user, query);
  }

  @Get('supplier-statement')
  @AdminPolicy('reports.suppliers.read')
  supplierStatement(
    @Req() request: AdminRequest,
    @Query() query: SupplierStatementQueryDto,
  ) {
    return this.reportsPart3.supplierStatement(request.user, query);
  }

  @Get('stock-movement')
  @AdminPolicy('reports.stock.read', 'cost.view')
  stockMovement(
    @Req() request: AdminRequest,
    @Query() query: StockMovementReportQueryDto,
  ) {
    return this.reportsPart3.stockMovement(request.user, query);
  }

  @Get('expenses')
  @AdminPolicy('reports.expenses.read')
  expenses(
    @Req() request: AdminRequest,
    @Query() query: ExpenseReportQueryDto,
  ) {
    return this.reportsPart3.expenses(request.user, query);
  }

  @Get('cash')
  @AdminPolicy('reports.cash.read')
  cash(@Req() request: AdminRequest, @Query() query: PeriodReportQueryDto) {
    return this.reportsPart2.cash(request.user, query);
  }

  @Get('delivery-custody')
  @AdminPolicy('reports.cash.read')
  deliveryCustody(
    @Req() request: AdminRequest,
    @Query() query: AsOfReportQueryDto,
  ) {
    return this.reportsPart2.deliveryCustody(request.user, query);
  }

  @Get('liabilities')
  @AdminPolicy('reports.liabilities.read')
  liabilities(
    @Req() request: AdminRequest,
    @Query() query: AsOfReportQueryDto,
  ) {
    return this.reportsPart2.liabilities(request.user, query);
  }

  @Get('inventory-valuation')
  @AdminPolicy('reports.inventory.read', 'cost.view')
  inventoryValuation(
    @Req() request: AdminRequest,
    @Query() query: InventoryValuationQueryDto,
  ) {
    return this.reportsPart2.inventoryValuation(request.user, query);
  }

  @Get('dashboard')
  @AdminAnyPermissionPolicy(
    'orders.view',
    'reports.sales.read',
    'reports.profit.read',
    'reports.cash.read',
    'reports.liabilities.read',
    'reports.inventory.read',
    'reports.purchases.read',
    'reports.suppliers.read',
    'reports.stock.read',
    'reports.expenses.read',
  )
  dashboard(@Req() request: AdminRequest) {
    return this.reportsPart2.dashboard(request.user);
  }

  @Get('sales')
  @AdminPolicy('reports.sales.read')
  sales(@Req() request: AdminRequest, @Query() query: SalesReportQueryDto) {
    return this.reports.sales(request.user, query);
  }

  @Get('profitability')
  @AdminPolicy('reports.profit.read')
  profitability(
    @Req() request: AdminRequest,
    @Query() query: ProfitabilityReportQueryDto,
  ) {
    return this.reports.profitability(request.user, query);
  }

  @Get('profit-loss')
  @AdminPolicy('reports.financial.read')
  profitLoss(@Req() request: AdminRequest, @Query() query: ProfitLossQueryDto) {
    return this.reports.profitLoss(request.user, query);
  }

  @Get('trial-balance')
  @AdminPolicy('reports.financial.read')
  trialBalance(
    @Req() request: AdminRequest,
    @Query() query: AsOfReportQueryDto,
  ) {
    return this.reports.trialBalance(request.user, query);
  }

  @Get('balance-sheet')
  @AdminPolicy('reports.financial.read')
  balanceSheet(
    @Req() request: AdminRequest,
    @Query() query: AsOfReportQueryDto,
  ) {
    return this.reports.balanceSheet(request.user, query);
  }

  @Post('exports')
  @HttpCode(202)
  @AdminAnyPermissionPolicy(
    'reports.sales.read',
    'reports.profit.read',
    'reports.financial.read',
    'reports.cash.read',
    'reports.liabilities.read',
    'reports.inventory.read',
    'reports.purchases.read',
    'reports.suppliers.read',
    'reports.stock.read',
    'reports.expenses.read',
  )
  createExport(
    @Req() request: AdminRequest,
    @Body() input: CreateReportExportDto,
  ) {
    return this.exports.create(request.user, input);
  }

  @Get('exports/:id/progress')
  @AdminAnyPermissionPolicy(
    'reports.sales.read',
    'reports.profit.read',
    'reports.financial.read',
    'reports.cash.read',
    'reports.liabilities.read',
    'reports.inventory.read',
    'reports.purchases.read',
    'reports.suppliers.read',
    'reports.stock.read',
    'reports.expenses.read',
  )
  exportProgress(@Req() request: AdminRequest, @Param('id', uuid) id: string) {
    return this.exports.progress(id, request.user);
  }

  @Get('exports/:id/download')
  @AdminAnyPermissionPolicy(
    'reports.sales.read',
    'reports.profit.read',
    'reports.financial.read',
    'reports.cash.read',
    'reports.liabilities.read',
    'reports.inventory.read',
  )
  async downloadExport(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.exports.download(id, request.user);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    return new StreamableFile(file.body);
  }
}
