import 'package:json_annotation/json_annotation.dart';

part 'product_availability.g.dart';

/// Live availability for a product, computed by the API at read time. Shapes
/// match `ProductAvailability` in `api/openapi.yaml` (`GET
/// /products/{id}/availability`).
@JsonSerializable(explicitToJson: true)
class ProductAvailability {
  const ProductAvailability({
    required this.productId,
    required this.inStock,
    required this.availableQty,
    this.variants = const [],
  });

  @JsonKey(name: 'product_id')
  final String productId;
  @JsonKey(name: 'in_stock')
  final bool inStock;

  /// Total sellable across variants.
  @JsonKey(name: 'available_qty')
  final num availableQty;

  final List<VariantAvailability> variants;

  /// The availability row for a given variant id, or null when absent.
  VariantAvailability? forVariant(String? variantId) {
    for (final v in variants) {
      if (v.variantId == variantId) return v;
    }
    return null;
  }

  factory ProductAvailability.fromJson(Map<String, dynamic> json) =>
      _$ProductAvailabilityFromJson(json);

  Map<String, dynamic> toJson() => _$ProductAvailabilityToJson(this);
}

@JsonSerializable()
class VariantAvailability {
  const VariantAvailability({
    this.variantId,
    this.sku = '',
    this.baseUnit,
    this.wholeUnitsOnly,
    this.lowStockThreshold,
    required this.availableQty,
    required this.inStock,
  });

  @JsonKey(name: 'variant_id')
  final String? variantId;
  final String sku;
  @JsonKey(name: 'available_qty')
  final num availableQty;
  @JsonKey(name: 'in_stock')
  final bool inStock;

  @JsonKey(name: 'base_unit', includeIfNull: false)
  final String? baseUnit;
  @JsonKey(name: 'whole_units_only', includeIfNull: false)
  final bool? wholeUnitsOnly;
  @JsonKey(name: 'low_stock_threshold', includeIfNull: false)
  final num? lowStockThreshold;

  factory VariantAvailability.fromJson(Map<String, dynamic> json) =>
      _$VariantAvailabilityFromJson(json);

  Map<String, dynamic> toJson() => _$VariantAvailabilityToJson(this);
}
