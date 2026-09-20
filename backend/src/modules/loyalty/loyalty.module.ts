import { Module } from '@nestjs/common';
import {
  AdminLoyaltyController,
  LoyaltyController,
} from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';

@Module({
  controllers: [LoyaltyController, AdminLoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
