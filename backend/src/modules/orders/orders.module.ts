import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CatalogModule } from '../catalog/catalog.module';
import { CartController, CouponController } from './cart.controller';
import { CartService } from './cart.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';
import { AdminOrdersController } from './admin-orders.controller';
import { MonitorOrdersController } from './monitor-orders.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { OrderTimeoutService } from './order-timeout.service';
import {
  AdminGovernoratesController,
  DeliveryZonesController,
  DiscountTiersController,
  GovernoratesController,
  PublicDiscountTiersController,
} from './delivery-pricing.controller';
import { DeliveryPricingService } from './delivery-pricing.service';
import { OrderTimeoutProcessor } from './order-timeout.processor';
import { OrderTimeoutScheduler } from './order-timeout.scheduler';
import { runsBackgroundJobs } from '../../config/process-role';

export const orderWorkerProviders = () =>
  runsBackgroundJobs() ? [OrderTimeoutProcessor, OrderTimeoutScheduler] : [];

@Module({
  imports: [
    CatalogModule,
    InventoryModule,
    BullModule.registerQueue({ name: 'order-maintenance' }),
  ],
  controllers: [
    CartController,
    CouponController,
    OrdersController,
    AdminOrdersController,
    MonitorOrdersController,
    AddressesController,
    GovernoratesController,
    PublicDiscountTiersController,
    AdminGovernoratesController,
    DeliveryZonesController,
    DiscountTiersController,
  ],
  providers: [
    CartService,
    OrdersService,
    AddressesService,
    OrderTimeoutService,
    DeliveryPricingService,
    ...orderWorkerProviders(),
  ],
  exports: [CartService],
})
export class OrdersModule {}
