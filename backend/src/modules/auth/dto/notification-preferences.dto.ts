import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  order_updates?: boolean;

  @IsOptional()
  @IsBoolean()
  delivery_updates?: boolean;

  @IsOptional()
  @IsBoolean()
  return_updates?: boolean;

  @IsOptional()
  @IsBoolean()
  loyalty_updates?: boolean;

  @IsOptional()
  @IsBoolean()
  promotions?: boolean;
}
