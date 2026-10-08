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
import {
  FinancialDocumentDto,
  OperationIdDto,
} from '../../finance/dto/finance.dto';

export class CustodyExceptionQuantityDto {
  @IsUUID('4')
  custody_holding_id!: string;

  @IsDecimal({ decimal_digits: '0,3', force_decimal: false })
  quantity!: string;
}

export class CustodyReturnLineDto extends CustodyExceptionQuantityDto {
  @IsUUID('4')
  location_id!: string;
}

export class CreateGoodsCustodyExceptionDto extends FinancialDocumentDto {
  @IsUUID('4')
  order_id!: string;

  @IsIn(['store', 'party'])
  liability_bearer!: 'store' | 'party';

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CustodyExceptionQuantityDto)
  lines!: CustodyExceptionQuantityDto[];
}

export class CreateReturnAgainstUncollectedDto extends FinancialDocumentDto {
  @IsUUID('4')
  order_id!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CustodyReturnLineDto)
  lines!: CustodyReturnLineDto[];
}

export class CreateDeliveryFeeRefundDto extends FinancialDocumentDto {
  @IsUUID('4')
  order_id!: string;

  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  amount_iqd!: string;

  @IsIn(['cash_account', 'uncollected'])
  settlement_method!: 'cash_account' | 'uncollected';

  @IsOptional()
  @IsUUID('4')
  cash_account_id?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ReverseCustodyExceptionDto extends OperationIdDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class CustodyExceptionQueryDto {
  @IsOptional()
  @IsIn(['goods_loss', 'return_against_uncollected', 'delivery_fee_refund'])
  type?: 'goods_loss' | 'return_against_uncollected' | 'delivery_fee_refund';

  @IsOptional()
  @IsUUID('4')
  party_id?: string;

  @IsOptional()
  @IsUUID('4')
  order_id?: string;

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
