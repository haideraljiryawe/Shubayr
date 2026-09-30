import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDecimal,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  per_page?: number;
}

export class BalanceQueryDto extends PageDto {
  @IsOptional() @IsUUID('4') warehouse_id?: string;
  @IsOptional() @IsUUID('4') location_id?: string;
  @IsOptional() @IsUUID('4') variant_id?: string;
  @IsOptional() @IsUUID('4') batch_id?: string;
}

export class LotQueryDto extends PageDto {
  @IsOptional() @IsUUID('4') variant_id?: string;
}

export class MovementQueryDto extends LotQueryDto {
  @IsOptional() @IsUUID('4') batch_id?: string;
  @IsOptional() @IsUUID('4') location_id?: string;
  @IsOptional() @IsUUID('4') custody_party_id?: string;
  @IsOptional()
  @IsString()
  @Matches(
    /^(receive|reserve|release|issue_to_custody|custody_to_sold|return_in|transfer|adjust|write_down)$/,
  )
  type?: string;
}

export class CreateWarehouseDto {
  @IsString() @MinLength(2) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
}

export class UpdateWarehouseDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

export class CreateLocationDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() is_sellable?: boolean;
}

export class UpdateLocationDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() is_sellable?: boolean;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

export class InventoryDocumentDto {
  @IsString() @MinLength(8) @MaxLength(128) operation_id!: string;
  @Matches(DATE) document_date!: string;
  @IsOptional() @Matches(DATE) accounting_date?: string;
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  backdate_reason?: string;
}

export class OpeningLineDto {
  @IsUUID('4') variant_id!: string;
  @IsUUID('4') location_id!: string;
  @IsOptional() @IsString() @MaxLength(80) lot_number?: string;
  @IsOptional() @Matches(DATE) expiry_date?: string;
  @IsDecimal({ decimal_digits: '0,3', force_decimal: false }) quantity!: string;
  @IsDecimal({ decimal_digits: '0,12', force_decimal: false })
  unit_cost_iqd!: string;
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,12', force_decimal: false })
  landed_cost_share?: string;
}

export class CreateOpeningDto extends InventoryDocumentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningLineDto)
  lines!: OpeningLineDto[];
}

export class TransferLineDto {
  @IsUUID('4') batch_id!: string;
  @IsUUID('4') from_location_id!: string;
  @IsUUID('4') to_location_id!: string;
  @IsDecimal({ decimal_digits: '0,3', force_decimal: false }) quantity!: string;
}

export class CreateTransferDto {
  @IsString() @MinLength(8) @MaxLength(128) operation_id!: string;
  @Matches(DATE) document_date!: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines!: TransferLineDto[];
}

export class CountScopeDto {
  @IsOptional() @IsUUID('4') warehouse_id?: string;
  @IsOptional() @IsUUID('4') location_id?: string;
  @IsOptional() @IsUUID('4') variant_id?: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class CountLineDto {
  @IsUUID('4') batch_id!: string;
  @IsUUID('4') location_id!: string;
  @IsDecimal({ decimal_digits: '0,3', force_decimal: false })
  counted_quantity!: string;
}

export class ApproveCountDto {
  @IsString() @MinLength(8) @MaxLength(128) operation_id!: string;
  @Matches(DATE) document_date!: string;
  @IsOptional() @Matches(DATE) accounting_date?: string;
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  backdate_reason?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CountLineDto)
  lines!: CountLineDto[];
}

export class WriteDownLineDto {
  @IsUUID('4') batch_id!: string;
  @IsUUID('4') location_id!: string;
  @IsDecimal({ decimal_digits: '0,3', force_decimal: false }) quantity!: string;
}

export class CreateWriteDownDto extends InventoryDocumentDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WriteDownLineDto)
  lines!: WriteDownLineDto[];
}
