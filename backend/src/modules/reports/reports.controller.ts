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
  ProfitabilityReportQueryDto,
  ProfitLossQueryDto,
  SalesReportQueryDto,
} from './reports.dto';
import { ReportsService } from './reports.service';

type AdminRequest = Request & { user: AuthenticatedRequestUser };
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 422 });

@Controller('admin/reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exports: ReportExportService,
  ) {}

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
  )
  exportProgress(@Req() request: AdminRequest, @Param('id', uuid) id: string) {
    return this.exports.progress(id, request.user);
  }

  @Get('exports/:id/download')
  @AdminAnyPermissionPolicy(
    'reports.sales.read',
    'reports.profit.read',
    'reports.financial.read',
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
