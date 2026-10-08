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
import { FinanceModule } from '../finance/finance.module';
import { CustodyExceptionsController } from './custody-exceptions.controller';
import { CustodyExceptionsService } from './custody-exceptions.service';
import { ExternalDriverTripsController } from './external-driver-trips.controller';
import { ExternalDriverTripsService } from './external-driver-trips.service';

@Module({
  imports: [LoyaltyModule, InventoryModule, FinanceModule],
  controllers: [
    DeliveriesController,
    AdminDeliveriesController,
    DeliveryAgentsController,
    AgentCustodyController,
    DeliveryPartiesController,
    ExternalDriversController,
    CustodyExceptionsController,
    ExternalDriverTripsController,
  ],
  providers: [
    DeliveriesService,
    DeliveryPartiesService,
    CustodyExceptionsService,
    ExternalDriverTripsService,
  ],
})
export class FulfilmentModule {}
