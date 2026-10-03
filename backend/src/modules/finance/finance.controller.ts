import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminPolicy } from '../../common/decorators/access-policy.decorator';
import { AdminAnyPermissionPolicy } from '../../common/decorators/access-policy.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { Prisma } from '../../generated/prisma/client';
import { CashAccountService } from './cash-account.service';
import { CurrencyService } from './currency.service';
import { LinkedPricingService } from './linked-pricing.service';
import {
  LinkedPriceApplyDto,
  LinkedPricePreviewDto,
  PricePublishDecisionDto,
} from './dto/linked-price.dto';
import { DraftService } from './draft.service';
import {
  AsOfQueryDto,
  CashTransferDto,
  ClosePeriodDto,
  CreateCashAccountDto,
  CurrencyUpdateDto,
  ExchangeRateCreateDto,
  LedgerQueryDto,
  OpeningBalanceDto,
  RateLookupQueryDto,
  ReopenPeriodDto,
  SaveDraftDto,
  UpdateCashAccountDto,
} from './dto/finance.dto';
import { LedgerService } from './ledger.service';
import { OperationService } from './operation.service';
import { PeriodService } from './period.service';

type AdminRequest = Request & { user: AuthenticatedRequestUser };
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 422 });

@Controller('admin/currencies')
export class CurrencyController {
  constructor(private readonly currencies: CurrencyService) {}

  @Get()
  @AdminPolicy('fx_rates.view')
  list() {
    return this.currencies.list();
  }

  @Patch(':code')
  @AdminPolicy('settings.manage')
  update(
    @Req() request: AdminRequest,
    @Param('code') code: string,
    @Body() input: CurrencyUpdateDto,
  ) {
    return this.currencies.update(code.toUpperCase(), request.user.id, input);
  }
}

@Controller('admin/exchange-rates')
export class ExchangeRateController {
  constructor(
    private readonly currencies: CurrencyService,
    private readonly linkedPrices: LinkedPricingService,
  ) {}

  @Get()
  @AdminPolicy('fx_rates.view')
  list(@Query('currency_code') currencyCode?: string) {
    return this.currencies.listRates(currencyCode?.toUpperCase());
  }

  @Post()
  @AdminPolicy('fx_rates.update')
  create(@Req() request: AdminRequest, @Body() input: ExchangeRateCreateDto) {
    return this.currencies.createRate(request.user.id, input);
  }

  @Post('linked-price-preview')
  @AdminPolicy('fx_rates.update')
  previewLinked(
    @Req() request: AdminRequest,
    @Body() input: LinkedPricePreviewDto,
  ) {
    return this.linkedPrices.preview(request.user.id, input);
  }

  @Post('save-rate-only')
  @AdminPolicy('fx_rates.update')
  saveRateOnly(
    @Req() request: AdminRequest,
    @Body() input: LinkedPriceApplyDto,
  ) {
    return this.linkedPrices.applyRateOnly(request.user.id, input);
  }

  @Post('publish-linked-prices')
  @AdminPolicy('fx_rates.update', 'prices.publish_linked')
  publishLinked(
    @Req() request: AdminRequest,
    @Body() input: LinkedPriceApplyDto,
  ) {
    return this.linkedPrices.publish(request.user.id, input);
  }

  @Get(':code/applicable')
  @AdminPolicy('fx_rates.view')
  applicable(@Param('code') code: string, @Query() query: RateLookupQueryDto) {
    return this.currencies.applicable(code.toUpperCase(), new Date(query.at));
  }
}

@Controller('admin/price-publish-approvals')
export class PricePublishApprovalsController {
  constructor(private readonly linkedPrices: LinkedPricingService) {}

  @Post(':id/decision')
  @AdminPolicy('sell_below_cost.approve')
  decide(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: PricePublishDecisionDto,
  ) {
    return this.linkedPrices.decide(request.user.id, id, input);
  }
}

@Controller('admin/operations')
@AdminPolicy()
export class OperationsController {
  constructor(private readonly operations: OperationService) {}

  @Get(':operationId')
  outcome(
    @Req() request: AdminRequest,
    @Param('operationId') operationId: string,
  ) {
    return this.operations.outcome(request.user.id, operationId);
  }
}

@Controller('admin/drafts')
@AdminPolicy()
export class DraftsController {
  constructor(private readonly drafts: DraftService) {}

  @Get()
  list(@Req() request: AdminRequest) {
    return this.drafts.list(request.user.id);
  }

  @Get(':documentType')
  get(
    @Req() request: AdminRequest,
    @Param('documentType') documentType: string,
  ) {
    return this.drafts.get(request.user.id, documentType);
  }

  @Put(':documentType')
  save(
    @Req() request: AdminRequest,
    @Param('documentType') documentType: string,
    @Body() input: SaveDraftDto,
  ) {
    return this.drafts.save(
      request.user.id,
      documentType,
      input.payload as Prisma.InputJsonObject,
    );
  }

  @Delete(':documentType')
  @HttpCode(204)
  discard(
    @Req() request: AdminRequest,
    @Param('documentType') documentType: string,
  ) {
    return this.drafts.discard(request.user.id, documentType);
  }
}

@Controller('admin/ledger')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('entries')
  @AdminPolicy('ledger.view')
  entries(@Query() query: LedgerQueryDto) {
    return this.ledger.entries(query);
  }

  @Get('entries/:id')
  @AdminPolicy('ledger.view')
  get(@Param('id', uuid) id: string) {
    return this.ledger.get(id);
  }

  @Get('trial-balance')
  @AdminPolicy('ledger.view')
  trialBalance(@Query() query: AsOfQueryDto) {
    return this.ledger.trialBalance(query.as_of);
  }

  @Get('accounts/:code/balance')
  @AdminPolicy('ledger.view')
  accountBalance(@Param('code') code: string, @Query() query: AsOfQueryDto) {
    return this.ledger.accountBalance(code, query.as_of);
  }

  @Post('entries/:id/reversal')
  @AdminPolicy('ledger.reverse')
  reverse(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: ReopenPeriodDto,
  ) {
    return this.ledger.reverse(id, request.user.id, input.reason);
  }
}

@Controller('admin/cash-accounts')
export class CashAccountsController {
  constructor(private readonly cash: CashAccountService) {}

  @Get()
  @AdminPolicy('cash_accounts.view')
  list() {
    return this.cash.list();
  }

  @Post()
  @AdminPolicy('cash_accounts.manage')
  create(@Req() request: AdminRequest, @Body() input: CreateCashAccountDto) {
    return this.cash.create(request.user.id, input);
  }

  @Get(':id')
  @AdminPolicy('cash_accounts.view')
  get(@Param('id', uuid) id: string) {
    return this.cash.get(id);
  }

  @Patch(':id')
  @AdminPolicy('cash_accounts.manage')
  update(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: UpdateCashAccountDto,
  ) {
    return this.cash.update(request.user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  @AdminPolicy('cash_accounts.manage')
  remove(@Req() request: AdminRequest, @Param('id', uuid) id: string) {
    return this.cash.remove(request.user.id, id);
  }

  @Post(':id/opening-balance')
  @AdminPolicy('cash_accounts.manage')
  openingBalance(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: OpeningBalanceDto,
  ) {
    return this.cash.openingBalance(request.user, id, input);
  }
}

@Controller('admin/cash-transfers')
@AdminPolicy('cash_accounts.manage')
export class CashTransfersController {
  constructor(private readonly cash: CashAccountService) {}

  @Post()
  create(@Req() request: AdminRequest, @Body() input: CashTransferDto) {
    return this.cash.transfer(request.user, input);
  }
}

@Controller('admin/financial-documents')
export class FinancialDocumentsController {
  constructor(private readonly cash: CashAccountService) {}

  @Get(':id')
  @AdminAnyPermissionPolicy('ledger.view', 'cash_accounts.view')
  get(@Param('id', uuid) id: string) {
    return this.cash.getDocument(id);
  }
}

@Controller('admin/accounting-periods')
export class AccountingPeriodsController {
  constructor(private readonly periods: PeriodService) {}

  @Get()
  @AdminPolicy('ledger.view')
  list() {
    return this.periods.list();
  }

  @Get(':month/checklist')
  @AdminPolicy('period.close')
  checklist(@Param('month') month: string) {
    return this.periods.checklist(month);
  }

  @Post(':month/close')
  @AdminPolicy('period.close')
  close(
    @Req() request: AdminRequest,
    @Param('month') month: string,
    @Body() input: ClosePeriodDto,
  ) {
    return this.periods.close(request.user.id, month, input.reason);
  }

  @Post(':month/reopen')
  @AdminPolicy('period.reopen')
  reopen(
    @Req() request: AdminRequest,
    @Param('month') month: string,
    @Body() input: ReopenPeriodDto,
  ) {
    return this.periods.reopen(request.user.id, month, input.reason);
  }
}
