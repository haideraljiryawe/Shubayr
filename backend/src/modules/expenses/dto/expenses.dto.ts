import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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

export class CreateExpenseCategoryDto {
  @IsString() @MinLength(1) @MaxLength(160) name_ar!: string;
  @IsString() @MinLength(1) @MaxLength(160) name_en!: string;
  @IsOptional() @IsUUID('4') ledger_account_id?: string;
}

export class UpdateExpenseCategoryDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) name_ar?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) name_en?: string;
  @IsOptional() @IsUUID('4') ledger_account_id?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

export class CreateExpenseDto {
  @IsUUID('4') category_id!: string;
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false }) amount!: string;
  @Matches(CURRENCY) currency_code!: string;
  @IsIn(['paid_now', 'owed']) payment_mode!: 'paid_now' | 'owed';
  @IsOptional() @IsUUID('4') cash_account_id?: string;
  @IsOptional() @IsUUID('4') supplier_id?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) payee?: string;
  @IsString() @MinLength(1) @MaxLength(2000) description!: string;
  @IsOptional() @IsString() @MaxLength(160) reference_number?: string;
  @IsOptional() @IsUUID('4') receipt_media_id?: string;
  @Matches(DATE) document_date!: string;
  @IsOptional() @Matches(DATE) accounting_date?: string;
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  backdate_reason?: string;
}

export class PostExpenseDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(500) note?: string;
}

export class PayExpenseDto {
  @IsUUID('4') cash_account_id!: string;
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false }) amount!: string;
  @Matches(DATE) document_date!: string;
  @IsOptional() @Matches(DATE) accounting_date?: string;
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  backdate_reason?: string;
  @IsOptional() @IsString() @MaxLength(160) reference_number?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class ReverseExpenseDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @Matches(DATE) document_date!: string;
  @IsOptional() @Matches(DATE) accounting_date?: string;
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  backdate_reason?: string;
}

export class ExpenseQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  per_page?: number;
  @IsOptional() @Matches(DATE) from?: string;
  @IsOptional() @Matches(DATE) to?: string;
  @IsOptional() @IsUUID('4') category_id?: string;
  @IsOptional() @IsIn(['draft', 'posted', 'reversed']) status?: string;
  @IsOptional() @IsUUID('4') cash_account_id?: string;
  @IsOptional() @IsString() @MaxLength(200) payee?: string;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  unpaid_only?: boolean;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional()
  @IsIn(['document_date', 'amount', 'created_at', 'payee', 'document_number'])
  sort?: string;
  @IsOptional() @IsIn(['asc', 'desc']) direction?: 'asc' | 'desc';
}
