import {
  Controller,
  Get,
  GoneException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CategoriesService } from './categories.service';
import { CategoryQueryDto, ProductQueryDto } from './dto/catalog-query.dto';
import { ProductsService } from './products.service';
import { BrandsService } from './brands.service';
import { BrandQueryDto } from './dto/brand.dto';
import {
  RateLimitRisk,
  RateLimitTier,
} from '../../common/rate-limit/rate-limit-tier';

@Public()
@RateLimitTier(RateLimitRisk.Catalog)
@Controller()
export class CatalogController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly products: ProductsService,
    private readonly brands: BrandsService,
  ) {}

  @Get('categories')
  listCategories(@Query() query: CategoryQueryDto) {
    return this.categories.list(query, false);
  }

  @Get('brands')
  listBrands(@Query() query: BrandQueryDto) {
    return this.brands.list(query, false);
  }

  @Get('products')
  listProducts(@Query() query: ProductQueryDto) {
    return this.products.listPublic(query);
  }

  @Get('products/:id')
  getProduct(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.products.getPublic(id);
  }

  @Get('products/:id/availability')
  getAvailability(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.products.availability(id, true);
  }

  @Post('products/:id/negotiations')
  @RateLimitTier(RateLimitRisk.Normal)
  negotiationRemoved() {
    throw new GoneException({
      status: 410,
      code: 'NEGOTIATION_REMOVED',
      message: 'Price negotiation has been removed',
      errors: [],
    });
  }
}
