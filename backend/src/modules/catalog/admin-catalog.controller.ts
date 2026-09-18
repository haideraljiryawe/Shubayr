import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CategoriesService } from './categories.service';
import { CategoryQueryDto, ProductQueryDto } from './dto/catalog-query.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@RequirePermissions('catalog.manage')
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@Query() query: CategoryQueryDto) {
    return this.categories.list(query, true);
  }

  @Post()
  create(@Body() input: CreateCategoryDto) {
    return this.categories.create(input);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: UpdateCategoryDto,
  ) {
    return this.categories.update(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.categories.remove(id);
  }
}

@RequirePermissions('catalog.manage')
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() query: ProductQueryDto) {
    return this.products.listAdmin(query);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.products.getAdmin(id);
  }

  @Post()
  create(@Body() input: CreateProductDto) {
    return this.products.create(input);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: UpdateProductDto,
  ) {
    return this.products.update(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  archive(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.products.archive(id);
  }
}
