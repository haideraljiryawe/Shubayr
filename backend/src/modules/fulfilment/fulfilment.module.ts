import { Module } from '@nestjs/common';
import {
  AdminDeliveriesController,
  DeliveriesController,
  DeliveryAgentsController,
} from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { InventoryModule } from '../inventory/inventory.module';
import {
  AgentCustodyController,
  DeliveryPartiesController,
  ExternalDriversController,
} from './delivery-parties.controller';
import { DeliveryPartiesService } from './delivery-parties.service';

@Module({
  imports: [LoyaltyModule, InventoryModule],
  controllers: [
    DeliveriesController,
    AdminDeliveriesController,
    DeliveryAgentsController,
    AgentCustodyController,
    DeliveryPartiesController,
    ExternalDriversController,
  ],
  providers: [DeliveriesService, DeliveryPartiesService],
})
export class FulfilmentModule {}
