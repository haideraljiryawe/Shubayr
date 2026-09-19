import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CartController, CouponController } from './cart.controller';
import { CartService } from './cart.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';

@Module({
  imports: [CatalogModule],
  controllers: [
    CartController,
    CouponController,
    OrdersController,
    AddressesController,
  ],
  providers: [CartService, OrdersService, AddressesService],
  exports: [CartService],
})
export class OrdersModule {}
