import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateNotificationPreferencesDto } from '../auth/dto/notification-preferences.dto';
import { AddressCreateDto, AddressPatchDto } from './dto/address-write.dto';

describe('account contract DTOs', () => {
  it('requires a real address contact phone', async () => {
    const missing = plainToInstance(AddressCreateDto, { city: 'Baghdad' });
    expect((await validate(missing)).map(({ property }) => property)).toContain(
      'contact_phone',
    );

    const valid = plainToInstance(AddressCreateDto, {
      city: 'Baghdad',
      contact_phone: '+9647800000000',
    });
    await expect(validate(valid)).resolves.toEqual([]);
  });

  it('keeps address PATCH partial while rejecting unknown boolean phone aliases', async () => {
    const partial = plainToInstance(AddressPatchDto, {
      contact_phone: '+9647700000000',
    });
    await expect(validate(partial)).resolves.toEqual([]);

    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    await expect(
      pipe.transform(
        { use_account_phone: true },
        { type: 'body', metatype: AddressPatchDto },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts partial persisted notification preferences and rejects non-booleans', async () => {
    await expect(
      validate(
        plainToInstance(UpdateNotificationPreferencesDto, {
          promotions: true,
        }),
      ),
    ).resolves.toEqual([]);

    const invalid = await validate(
      plainToInstance(UpdateNotificationPreferencesDto, {
        delivery_updates: 'yes',
      }),
    );
    expect(invalid.map(({ property }) => property)).toEqual([
      'delivery_updates',
    ]);
  });
});
