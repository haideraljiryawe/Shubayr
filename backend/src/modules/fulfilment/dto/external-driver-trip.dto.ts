import { Type } from 'class-transformer';
import {
  IsDateString,
  IsDecimal,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
  ArrayMinSize,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { FinancialDocumentDto } from '../../finance/dto/finance.dto';
import {
  CustodyExceptionQuantityDto,
  CustodyReturnLineDto,
} from './custody-exception.dto';

export class CreateExternalDriverTripDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  operation_id!: string;

  @IsUUID()
  driver_party_id!: string;

  @IsIn(['store', 'customer_direct'])
  fare_bearer!: 'store' | 'customer_direct';

  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  fare_amount_iqd!: string;

  @IsIn(['payable', 'cash_account', 'driver_keeps', 'customer_direct'])
  fare_settlement_method!:
    'payable' | 'cash_account' | 'driver_keeps' | 'customer_direct';

  @ValidateIf(
    (input: CreateExternalDriverTripDto) =>
      input.fare_settlement_method === 'cash_account',
  )
  @IsUUID()
  fare_cash_account_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  failure_cancellation_agreement?: string;

  @IsDateString({ strict: true })
  document_date!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  accounting_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  backdate_reason?: string;
}

export class AddExternalDriverTripOrderDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  operation_id!: string;

  @IsUUID()
  order_id!: string;

  @IsInt()
  @Min(1)
  order_version!: number;

  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  fare_share_iqd!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  source!: string;

  @IsISO8601({ strict: true })
  event_at!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customer_acceptance_note?: string;
}

export class StartExternalDriverTripDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  operation_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  source!: string;

  @IsISO8601({ strict: true })
  event_at!: string;
}

export class ExternalDriverTripDeliveredDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  operation_id!: string;

  @IsInt()
  @Min(1)
  order_version!: number;

  @IsIn(['confirmed', 'unconfirmed'])
  collection_confirmation!: 'confirmed' | 'unconfirmed';

  @ValidateIf(
    (input: ExternalDriverTripDeliveredDto) =>
      input.collection_confirmation === 'confirmed',
  )
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  collected_amount?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  source!: string;

  @IsISO8601({ strict: true })
  event_at!: string;
}

export class ExternalDriverTripFailedDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  operation_id!: string;

  @IsInt()
  @Min(1)
  order_version!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  source!: string;

  @IsISO8601({ strict: true })
  event_at!: string;
}

export class ExternalDriverTripLossDto extends FinancialDocumentDto {
  @IsIn(['store', 'party'])
  liability_bearer!: 'store' | 'party';

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  source!: string;

  @IsISO8601({ strict: true })
  event_at!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CustodyExceptionQuantityDto)
  lines!: CustodyExceptionQuantityDto[];
}

export class ExternalDriverTripDoorReturnDto extends FinancialDocumentDto {
  @IsInt()
  @Min(1)
  order_version!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  source!: string;

  @IsISO8601({ strict: true })
  event_at!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CustodyReturnLineDto)
  lines!: CustodyReturnLineDto[];
}

export class CloseExternalDriverTripDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  operation_id!: string;

  @IsDateString({ strict: true })
  document_date!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  accounting_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  backdate_reason?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  source!: string;

  @IsISO8601({ strict: true })
  event_at!: string;
}

export class ExternalDriverTripQueryDto {
  @IsOptional()
  @IsUUID()
  driver_party_id?: string;

  @IsOptional()
  @IsIn(['open', 'in_progress', 'closed'])
  status?: 'open' | 'in_progress' | 'closed';

  @IsOptional()
  @IsDateString({ strict: true })
  date_from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  date_to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  per_page = 20;
}
