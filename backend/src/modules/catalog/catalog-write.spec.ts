import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';
const IMAGE_ID = '22222222-2222-4222-8222-222222222222';

describe('catalog write contract', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  it('accepts every writable product field', async () => {
    const input = plainToInstance(CreateProductDto, {
      category_id: CATEGORY_ID,
      name_en: 'Apples',
      name_ar: 'تفاح',
      description: 'Fresh',
      price: 20.15,
      discount_type: 'percentage',
      discount_value: 50,
      is_negotiable: false,
      floor_price: null,
      points_price: 200,
      tracks_expiry: true,
      status: 'active',
      images: [{ url: 'https://cdn.example.com/one.jpg' }],
      variants: [
        { sku: 'APPLE-1', attributes: { size: '1kg' }, price_delta: 0 },
      ],
    });
    await expect(validate(input)).resolves.toEqual([]);
  });

  it('rejects unknown and read-only product properties', async () => {
    await expect(
      pipe.transform(
        {
          category_id: CATEGORY_ID,
          name_en: 'Apples',
          name_ar: 'تفاح',
          price: 20,
          effective_price: 10,
        },
        { type: 'body', metatype: CreateProductDto },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts ordered media add/remove/replace/move operations', async () => {
    const input = plainToInstance(UpdateProductDto, {
      media_operations: [
        { op: 'add', url: 'https://cdn.example.com/new.jpg', position: 0 },
        {
          op: 'replace',
          image_id: IMAGE_ID,
          url: 'https://cdn.example.com/replacement.jpg',
        },
        { op: 'move', image_id: IMAGE_ID, position: 1 },
        { op: 'remove', image_id: IMAGE_ID },
      ],
    });
    await expect(validate(input)).resolves.toEqual([]);
  });

  it('accepts localized category metadata and rejects icon codepoints', async () => {
    const valid = plainToInstance(CreateCategoryDto, {
      name_en: 'Electronics',
      name_ar: 'إلكترونيات',
      description_en: 'Devices',
      description_ar: 'أجهزة',
      image_url: 'https://cdn.example.com/electronics.jpg',
      icon_key: 'consumer_electronics',
      is_visible: false,
      sort_order: 2,
    });
    await expect(validate(valid)).resolves.toEqual([]);

    const codepoint = plainToInstance(CreateCategoryDto, {
      name_en: 'Electronics',
      name_ar: 'إلكترونيات',
      icon_key: '0xe3af',
    });
    const errors = await validate(codepoint);
    expect(errors.map(({ property }) => property)).toContain('icon_key');
  });
});
