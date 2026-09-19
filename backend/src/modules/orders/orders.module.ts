import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CartController, CouponController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [CatalogModule],
  controllers: [CartController, CouponController],
  providers: [CartService],
  exports: [CartService],
})
export class OrdersModule {}
