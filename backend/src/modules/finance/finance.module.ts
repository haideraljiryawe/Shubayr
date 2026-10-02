import { Module } from '@nestjs/common';
import { CashAccountService } from './cash-account.service';
import {
  AccountingPeriodsController,
  CashAccountsController,
  CashTransfersController,
  CurrencyController,
  DraftsController,
  ExchangeRateController,
  FinancialDocumentsController,
  LedgerController,
  OperationsController,
} from './finance.controller';
import { CurrencyService } from './currency.service';
import { DateRulesService } from './date-rules.service';
import { DocumentNumberService } from './document-number.service';
import { DraftService } from './draft.service';
import { LedgerService } from './ledger.service';
import { OperationService } from './operation.service';
import { LinkedPricingService } from './linked-pricing.service';
import { PeriodService } from './period.service';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [CatalogModule],
  controllers: [
    CurrencyController,
    ExchangeRateController,
    OperationsController,
    DraftsController,
    LedgerController,
    CashAccountsController,
    CashTransfersController,
    FinancialDocumentsController,
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
    LinkedPricingService,
  ],
  exports: [
    CurrencyService,
    DateRulesService,
    DocumentNumberService,
    LedgerService,
    OperationService,
  ],
})
export class FinanceModule {}
