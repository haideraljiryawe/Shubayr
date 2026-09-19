import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBannerDto } from '../../banners/dto/create-banner.dto';
import { CategoryWriteDto } from './category-write.dto';
import { ProductImageInputDto } from './product-media.dto';

const localMediaUrl =
  'http://localhost:8000/api/v1/media/20000000-0000-4000-8000-000000000001';

describe('managed media URL DTOs', () => {
  it('accepts the stable local media URL on categories', async () => {
    const dto = plainToInstance(CategoryWriteDto, {
      name_en: 'Category',
      name_ar: 'فئة',
      image_url: localMediaUrl,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts the stable local media URL on products', async () => {
    const dto = plainToInstance(ProductImageInputDto, { url: localMediaUrl });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts the stable local media URL on banners', async () => {
    const dto = plainToInstance(CreateBannerDto, {
      title: 'Banner',
      image_url: localMediaUrl,
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
