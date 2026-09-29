import { Module } from '@nestjs/common';
import { CashAccountService } from './cash-account.service';
import {
  AccountingPeriodsController,
  CashAccountsController,
  CashTransfersController,
  CurrencyController,
  DraftsController,
  ExchangeRateController,
  LedgerController,
  OperationsController,
} from './finance.controller';
import { CurrencyService } from './currency.service';
import { DateRulesService } from './date-rules.service';
import { DocumentNumberService } from './document-number.service';
import { DraftService } from './draft.service';
import { LedgerService } from './ledger.service';
import { OperationService } from './operation.service';
import { PeriodService } from './period.service';

@Module({
  controllers: [
    CurrencyController,
    ExchangeRateController,
    OperationsController,
    DraftsController,
    LedgerController,
    CashAccountsController,
    CashTransfersController,
    AccountingPeriodsController,
  ],
  providers: [
    CurrencyService,
    DateRulesService,
    DocumentNumberService,
    DraftService,
    LedgerService,
    OperationService,
    CashAccountService,
    PeriodService,
  ],
})
export class FinanceModule {}
