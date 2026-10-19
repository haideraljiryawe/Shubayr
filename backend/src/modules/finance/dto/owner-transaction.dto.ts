import { Type } from 'class-transformer';
import {
  IsDecimal,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;

export class CreateOwnerTransactionDto {
  @IsIn(['capital_deposit', 'drawing'])
  kind!: 'capital_deposit' | 'drawing';

  @IsUUID('4') cash_account_id!: string;
  @Matches(CURRENCY) currency_code!: string;
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false }) amount!: string;
  @Matches(DATE) document_date!: string;
  @IsOptional() @Matches(DATE) accounting_date?: string;
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  backdate_reason?: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsOptional() @IsString() @MaxLength(160) reference_number?: string;
}

export class PostOwnerTransactionDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(500) note?: string;
}

export class ReverseOwnerTransactionDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @Matches(DATE) document_date!: string;
  @IsOptional() @Matches(DATE) accounting_date?: string;
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  backdate_reason?: string;
}

export class OwnerTransactionQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  per_page?: number;
  @IsOptional() @IsIn(['capital_deposit', 'drawing']) kind?: string;
  @IsOptional() @IsIn(['draft', 'posted', 'reversed']) status?: string;
  @IsOptional() @Matches(DATE) from?: string;
  @IsOptional() @Matches(DATE) to?: string;
}
