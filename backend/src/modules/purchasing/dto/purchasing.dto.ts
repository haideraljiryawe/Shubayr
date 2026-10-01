import { Type } from 'class-transformer';
import {
  IsArray,
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
  ValidateNested,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^(IQD|USD)$/;

export class SupplierDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(1000) address?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @Matches(CURRENCY) default_currency!: 'IQD' | 'USD';
  @Type(() => Number) @IsInt() @Min(0) @Max(3650) payment_terms_days!: number;
}

export class UpdateSupplierDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(1000) address?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @Matches(CURRENCY) default_currency?: 'IQD' | 'USD';
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  payment_terms_days?: number;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

export class PostingDocumentDto {
  @IsString() @MinLength(8) @MaxLength(128) operation_id!: string;
  @Matches(DATE) document_date!: string;
  @IsOptional() @Matches(DATE) accounting_date?: string;
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  backdate_reason?: string;
}

export class SupplierOpeningBalanceDto extends PostingDocumentDto {
  @Matches(CURRENCY) currency_code!: 'IQD' | 'USD';
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false }) amount!: string;
  @IsDecimal({ decimal_digits: '0,10', force_decimal: false })
  exchange_rate!: string;
  @IsOptional() @Matches(DATE) due_date?: string;
}

export class PurchaseLineDto {
  @IsUUID('4') variant_id!: string;
  @IsOptional() @IsUUID('4') location_id?: string;
  @IsDecimal({ decimal_digits: '0,3', force_decimal: false }) quantity!: string;
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,3', force_decimal: false })
  pack_size?: string;
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  unit_cost!: string;
  @IsOptional() @IsString() @MaxLength(80) lot_number?: string;
  @IsOptional() @Matches(DATE) expiry_date?: string;
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,12', force_decimal: false })
  manual_landed_cost_iqd?: string;
}

export class LandedCostDto {
  @IsString() @MinLength(2) @MaxLength(40) kind!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @Matches(CURRENCY) currency_code!: 'IQD' | 'USD';
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false }) amount!: string;
}

export class CreatePurchaseInvoiceDto extends PostingDocumentDto {
  @IsUUID('4') supplier_id!: string;
  @IsOptional() @IsString() @MaxLength(80) supplier_invoice_number?: string;
  @Matches(CURRENCY) currency_code!: 'IQD' | 'USD';
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,10', force_decimal: false })
  exchange_rate?: string;
  @IsUUID('4') default_location_id!: string;
  @IsIn(['value', 'quantity', 'manual']) allocation_method!:
    'value' | 'quantity' | 'manual';
  @IsOptional() @Matches(DATE) due_date?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines!: PurchaseLineDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LandedCostDto)
  landed_costs?: LandedCostDto[];
}

export class PaymentAllocationDto {
  @IsUUID('4') invoice_id!: string;
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false }) amount!: string;
}

export class AllocateSupplierCreditDto {
  @IsString() @MinLength(8) @MaxLength(128) operation_id!: string;
  @IsUUID('4') invoice_id!: string;
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false }) amount!: string;
}

export class CreateSupplierPaymentDto extends PostingDocumentDto {
  @IsUUID('4') supplier_id!: string;
  @IsUUID('4') cash_account_id!: string;
  @Matches(CURRENCY) currency_code!: 'IQD' | 'USD';
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false }) amount!: string;
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,10', force_decimal: false })
  exchange_rate?: string;
  @IsOptional() @IsString() @MaxLength(160) reference?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations!: PaymentAllocationDto[];
}

export class SupplierReturnLineDto {
  @IsUUID('4') purchase_item_id!: string;
  @IsUUID('4') batch_id!: string;
  @IsUUID('4') location_id!: string;
  @IsDecimal({ decimal_digits: '0,3', force_decimal: false }) quantity!: string;
}

export class CreateSupplierReturnDto extends PostingDocumentDto {
  @IsUUID('4') supplier_id!: string;
  @IsOptional() @IsUUID('4') invoice_id?: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierReturnLineDto)
  lines!: SupplierReturnLineDto[];
}

export class CostCorrectionLineDto {
  @IsUUID('4') purchase_item_id!: string;
  @IsDecimal({ decimal_digits: '0,12', force_decimal: false })
  unit_difference_iqd!: string;
}

export class CreateCostCorrectionDto extends PostingDocumentDto {
  @IsUUID('4') invoice_id!: string;
  @IsOptional() @IsUUID('4') supplier_id?: string;
  @IsIn(['cost_correction', 'late_landed_cost']) kind!:
    'cost_correction' | 'late_landed_cost';
  @IsIn(['value', 'quantity', 'manual']) allocation_method!:
    'value' | 'quantity' | 'manual';
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CostCorrectionLineDto)
  lines!: CostCorrectionLineDto[];
}

export class PurchasingQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  per_page?: number;
  @IsOptional() @IsUUID('4') supplier_id?: string;
  @IsOptional() @Matches(DATE) from?: string;
  @IsOptional() @Matches(DATE) to?: string;
  @IsOptional() @IsString() @MaxLength(30) status?: string;
  @IsOptional() @Matches(CURRENCY) currency?: 'IQD' | 'USD';
}

export class StatementQueryDto {
  @IsOptional() @Matches(CURRENCY) currency?: 'IQD' | 'USD';
  @IsOptional() @Matches(DATE) as_of?: string;
}
