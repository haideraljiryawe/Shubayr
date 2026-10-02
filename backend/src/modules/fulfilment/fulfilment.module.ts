import { Module } from '@nestjs/common';
import {
  AdminDeliveriesController,
  DeliveriesController,
  DeliveryAgentsController,
} from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [LoyaltyModule, InventoryModule],
  controllers: [
    DeliveriesController,
    AdminDeliveriesController,
    DeliveryAgentsController,
  ],
  providers: [DeliveriesService],
})
export class FulfilmentModule {}
