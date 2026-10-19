import { Module } from '@nestjs/common';
import { CashAccountService } from './cash-account.service';
import {
  AccountingPeriodsController,
  CashAccountsController,
  CashTransfersController,
  CashReceiptsController,
  CurrencyController,
  DraftsController,
  ExchangeRateController,
  FinancialDocumentsController,
  LedgerController,
  OperationsController,
  PricePublishApprovalsController,
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
import { CashReceiptService } from './cash-receipt.service';
import { OwnerTransactionsController } from './owner-transactions.controller';
import { OwnerTransactionsService } from './owner-transactions.service';

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
    CashReceiptsController,
    FinancialDocumentsController,
    AccountingPeriodsController,
    PricePublishApprovalsController,
    OwnerTransactionsController,
  ],
  providers: [
    CurrencyService,
    DateRulesService,
    DocumentNumberService,
    DraftService,
    LedgerService,
    OperationService,
    CashAccountService,
    CashReceiptService,
    PeriodService,
    LinkedPricingService,
    OwnerTransactionsService,
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
