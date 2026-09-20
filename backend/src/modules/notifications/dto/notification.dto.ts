import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { notificationChannels, notificationTypes } from '../notification-types';
import type {
  NotificationChannel,
  NotificationType,
} from '../notification-types';

export class RegisterDeviceDto {
  @IsString()
  @Length(1, 512)
  token!: string;

  @IsIn(['android', 'ios', 'web'])
  platform!: string;

  @IsOptional()
  @IsIn(['ar', 'en', 'ar-IQ', 'en-US'])
  locale?: string;
}

export class UnregisterDeviceDto {
  @IsString()
  @Length(1, 512)
  token!: string;
}

export class PreferenceEntryDto {
  @IsIn(notificationTypes)
  type!: NotificationType;

  @IsIn(notificationChannels)
  channel!: NotificationChannel;

  @IsBoolean()
  enabled!: boolean;
}

export class PatchPreferencesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PreferenceEntryDto)
  preferences!: PreferenceEntryDto[];
}

export class NotificationHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  per_page?: number;
}
