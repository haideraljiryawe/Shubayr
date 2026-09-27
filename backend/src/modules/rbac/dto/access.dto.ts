import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PERMISSION_KEYS,
  type PermissionKey,
} from '../../../common/access/permission-registry';
import { PASSWORD_PATTERN } from '../../auth/password';

export class ReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class CreateStaffDto extends ReasonDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(/^[a-z][a-z0-9._-]{2,79}$/)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string | null;

  @IsString()
  @Matches(PASSWORD_PATTERN)
  password!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  preset_ids?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(PERMISSION_KEYS, { each: true })
  permission_keys?: PermissionKey[];
}

export class UpdateStaffDto extends ReasonDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class SetStaffPasswordDto extends ReasonDto {
  @IsString()
  @Matches(PASSWORD_PATTERN)
  password!: string;
}

export class SetStaffAccessDto extends ReasonDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  preset_ids!: string[];

  @IsArray()
  @ArrayUnique()
  @IsIn(PERMISSION_KEYS, { each: true })
  permission_keys!: PermissionKey[];
}

export class CreatePresetDto extends ReasonDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9._-]{2,79}$/)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @IsArray()
  @ArrayUnique()
  @IsIn(PERMISSION_KEYS, { each: true })
  permission_keys!: PermissionKey[];
}

export class UpdatePresetDto extends ReasonDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9._-]{2,79}$/)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(PERMISSION_KEYS, { each: true })
  permission_keys?: PermissionKey[];
}

export class RegisterWorkPhoneDto extends ReasonDto {
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsIn(['delivery_agent', 'order_monitor'])
  role!: 'delivery_agent' | 'order_monitor';
}
