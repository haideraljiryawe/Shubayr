import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import {
  PurchaseCostCorrectionsController,
  PurchaseInvoicesController,
  SupplierCreditsController,
  SupplierPaymentsController,
  SupplierReturnsController,
  SuppliersController,
} from './purchasing.controller';
import { PurchasingService } from './purchasing.service';

@Module({
  imports: [FinanceModule],
  controllers: [
    SuppliersController,
    PurchaseInvoicesController,
    SupplierPaymentsController,
    SupplierCreditsController,
    SupplierReturnsController,
    PurchaseCostCorrectionsController,
  ],
  providers: [PurchasingService],
  exports: [PurchasingService],
})
export class PurchasingModule {}
