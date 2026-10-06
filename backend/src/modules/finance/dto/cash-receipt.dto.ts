import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsDecimal,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FinancialDocumentDto, OperationIdDto } from './finance.dto';

export class CashReceiptAllocationItemDto {
  @IsUUID('4')
  order_id!: string;

  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  amount_iqd!: string;
}

export class CreateCashReceiptDto extends FinancialDocumentDto {
  @IsUUID('4')
  party_id!: string;

  @IsUUID('4')
  cash_account_id!: string;

  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  amount_iqd!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CashReceiptAllocationItemDto)
  allocations: CashReceiptAllocationItemDto[] = [];
}

export class AllocateCashReceiptDto extends FinancialDocumentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CashReceiptAllocationItemDto)
  allocations!: CashReceiptAllocationItemDto[];
}

export class ReverseCashReceiptDto extends OperationIdDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class CashReceiptQueryDto {
  @IsOptional()
  @IsUUID('4')
  party_id?: string;

  @IsOptional()
  @IsUUID('4')
  cash_account_id?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  date_from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  date_to?: string;

  @IsOptional()
  @IsIn(['active', 'reversed'])
  status?: 'active' | 'reversed';

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

export class CashReceiptSuggestionQueryDto {
  @IsUUID('4')
  party_id!: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  amount_iqd?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  per_page = 100;
}
