import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { DISCOUNT_TYPES } from '../pricing';
import { BilingualNameDto } from './bilingual-name.dto';
import {
  ProductImageInputDto,
  ProductVariantInputDto,
} from './product-media.dto';

type PricingFields = {
  price?: number;
  discount_type?: string | null;
  discount_value?: number | null;
  discount_starts_at?: Date | null;
  discount_ends_at?: Date | null;
};

@ValidatorConstraint({ name: 'DiscountValueInRange' })
class DiscountValueInRange implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const { discount_type, price } = args.object as PricingFields;
    if (discount_type === undefined) {
      // PATCH may update only the value and inherit the stored discount type;
      // the service validates the merged definition atomically.
      if (value === null || value === undefined) return true;
      return (
        args.object.constructor.name === 'UpdateProductDto' &&
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value > 0 &&
        Math.abs(value * 100 - Math.round(value * 100)) <= 1e-9
      );
    }
    if (discount_type === null) {
      // With no discount defined a value is meaningless, so reject stray ones.
      return value === null || value === undefined;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return false;
    }
    if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-9) {
      return false;
    }
    if (discount_type === 'percentage') return value <= 100;
    // An amount discount may not swallow the whole price, but on a PATCH the
    // price often lives only in the stored row. Comparing against the payload
    // alone rejected every partial amount-discount update that (correctly)
    // left `price` out, so defer to the service, which re-validates the
    // merged stored+incoming definition before writing.
    if (typeof price === 'number') return value < price;
    return args.object.constructor.name === 'UpdateProductDto';
  }

  defaultMessage(args: ValidationArguments): string {
    const { discount_type } = args.object as PricingFields;
    if (discount_type === null) {
      return 'discount_value must be null or omitted when discount_type is not set';
    }
    if (discount_type === 'percentage') {
      return 'discount_value must have at most 2 decimal places and be greater than 0 and at most 100 for a percentage discount';
    }
    return 'discount_value must have at most 2 decimal places and be greater than 0 and less than price for an amount discount';
  }
}

@ValidatorConstraint({ name: 'DiscountWindowOrdered' })
class DiscountWindowOrdered implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const { discount_starts_at } = args.object as PricingFields;
    // Either bound may stand alone; only a fully bounded window can be ordered.
    if (!(value instanceof Date) || !(discount_starts_at instanceof Date)) {
      return true;
    }
    return value.getTime() > discount_starts_at.getTime();
  }

  defaultMessage(): string {
    return 'discount_ends_at must be after discount_starts_at';
  }
}

/**
 * Optional, but never null: the column behind the field is NOT NULL, so an
 * explicit null has to fail validation with the unified 422 instead of being
 * skipped by @IsOptional() and reaching Prisma as a null write (a 500).
 */
const IsDefinedIfPresent = (): PropertyDecorator =>
  ValidateIf((_, value: unknown) => value !== undefined);

const emptyToNull = ({ value }: { value: unknown }): unknown =>
  value === '' ? null : value;

// Done here rather than with @Type so it composes with the empty-to-null rule:
// an unparseable string becomes an Invalid Date that @IsDate then reports.
const toDateOrNull = ({ value }: { value: unknown }): unknown => {
  if (value === '' || value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  return new Date(value as string);
};

/**
 * Everything an admin may write on a product: both names plus the regular
 * `price` and the discount DEFINITION. The computed `on_sale`,
 * `discounted_price`, `effective_price` and `discount_percent` fields are
 * derived at read time and are deliberately absent here, so a write can never
 * set them.
 */
export class ProductWriteDto extends BilingualNameDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  below_cost_override_reason?: string | null;

  @IsUUID()
  category_id!: string;

  @IsOptional()
  @IsUUID()
  brand_id?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsInt({ message: 'IQD price must use whole dinars' })
  @Min(0, { message: 'price must not be negative' })
  price!: number;

  @IsOptional()
  @Transform(emptyToNull)
  @IsIn(DISCOUNT_TYPES, {
    message: `discount_type must be one of ${DISCOUNT_TYPES.join(', ')}, or null for no discount`,
  })
  discount_type?: string | null;

  // Not @IsOptional: the constraint itself decides whether a missing value is
  // acceptable, which is how "discount_type set requires a value" is enforced.
  @Validate(DiscountValueInRange)
  discount_value?: number | null;

  @IsOptional()
  @Transform(toDateOrNull)
  @IsDate({ message: 'discount_starts_at must be a valid date-time' })
  discount_starts_at?: Date | null;

  @IsOptional()
  @Transform(toDateOrNull)
  @IsDate({ message: 'discount_ends_at must be a valid date-time' })
  @Validate(DiscountWindowOrdered)
  discount_ends_at?: Date | null;

  @IsDefinedIfPresent()
  @IsBoolean()
  tracks_expiry?: boolean;

  @IsDefinedIfPresent()
  @IsIn(['active', 'hidden', 'archived'])
  status?: 'active' | 'hidden' | 'archived';

  @IsDefinedIfPresent()
  @IsBoolean()
  published?: boolean;

  @IsDefinedIfPresent()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageInputDto)
  images?: ProductImageInputDto[];

  @IsDefinedIfPresent()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantInputDto)
  variants?: ProductVariantInputDto[];
}
