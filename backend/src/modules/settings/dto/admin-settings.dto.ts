import { IsArray, IsObject, IsOptional } from 'class-validator';

export class AdminSettingsUpdateDto {
  @IsOptional()
  @IsObject()
  settings?: Record<string, string | null>;

  @IsOptional()
  @IsArray()
  business_hours?: Array<{
    weekday: number;
    opens_at: string | null;
    closes_at: string | null;
    is_closed: boolean;
  }>;

  @IsOptional()
  @IsArray()
  closed_days?: Array<{ date: string; reason?: string }>;

  @IsOptional()
  @IsObject()
  protection_thresholds?: Record<string, number>;
}
