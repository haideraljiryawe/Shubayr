import { Module } from '@nestjs/common';
import {
  DeliveriesController,
  DeliveryAgentsController,
} from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { LoyaltyModule } from '../loyalty/loyalty.module';

@Module({
  imports: [LoyaltyModule],
  controllers: [DeliveriesController, DeliveryAgentsController],
  providers: [DeliveriesService],
})
export class FulfilmentModule {}
