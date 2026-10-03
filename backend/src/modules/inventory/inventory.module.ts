import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import {
  InventoryController,
  PickListsController,
  RetrievalController,
} from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [FinanceModule],
  controllers: [InventoryController, RetrievalController, PickListsController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
