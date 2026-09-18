import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CategoriesService } from './categories.service';
import { CategoryQueryDto, ProductQueryDto } from './dto/catalog-query.dto';
import { ProductsService } from './products.service';

@Public()
@Controller()
export class CatalogController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly products: ProductsService,
  ) {}

  @Get('categories')
  listCategories(@Query() query: CategoryQueryDto) {
    return this.categories.list(query, false);
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
}
