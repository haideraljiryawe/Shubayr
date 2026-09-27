import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';

@Module({
  imports: [CatalogModule],
  controllers: [WishlistController],
  providers: [WishlistService],
})
export class WishlistModule {}
