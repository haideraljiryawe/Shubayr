import { Module } from '@nestjs/common';
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
} from './delivery-pricing.controller';
import { DeliveryPricingService } from './delivery-pricing.service';

@Module({
  imports: [CatalogModule, InventoryModule],
  controllers: [
    CartController,
    CouponController,
    OrdersController,
    AdminOrdersController,
    MonitorOrdersController,
    AddressesController,
    GovernoratesController,
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
  ],
  exports: [CartService],
})
export class OrdersModule {}
