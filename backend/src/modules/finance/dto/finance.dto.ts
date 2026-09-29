import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsDecimal,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const CURRENCY = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CurrencyUpdateDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  is_base?: boolean;
}

export class ExchangeRateCreateDto {
  @Matches(CURRENCY)
  currency_code!: string;

  @IsDecimal({ decimal_digits: '1,10', force_decimal: false })
  rate!: string;

  @IsIn([1, 100])
  basis!: 1 | 100;

  @IsISO8601({ strict: true })
  effective_at!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class RateLookupQueryDto {
  @IsDateString()
  at!: string;
}

export class OperationIdDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  operation_id!: string;
}

export class SaveDraftDto {
  @IsObject()
  payload!: Record<string, unknown>;
}

export class CreateCashAccountDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsIn(['cash', 'bank'])
  kind!: 'cash' | 'bank';

  @Matches(CURRENCY)
  currency_code!: string;
}

export class UpdateCashAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class FinancialDocumentDto extends OperationIdDto {
  @Matches(DATE)
  document_date!: string;

  @IsOptional()
  @Matches(DATE)
  accounting_date?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  backdate_reason?: string;
}

export class OpeningBalanceDto extends FinancialDocumentDto {
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  amount!: string;
}

export class CashTransferDto extends FinancialDocumentDto {
  @IsUUID('4')
  from_account_id!: string;

  @IsUUID('4')
  to_account_id!: string;

  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  amount!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class LedgerQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  account_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  source_type?: string;

  @IsOptional()
  @IsUUID('4')
  source_id?: string;

  @IsOptional()
  @Matches(DATE)
  from?: string;

  @IsOptional()
  @Matches(DATE)
  to?: string;

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

export class AsOfQueryDto {
  @IsOptional()
  @Matches(DATE)
  as_of?: string;
}

export class ClosePeriodDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReopenPeriodDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class MonthParamDto {
  @Matches(/^\d{4}-\d{2}$/)
  month!: string;
}
