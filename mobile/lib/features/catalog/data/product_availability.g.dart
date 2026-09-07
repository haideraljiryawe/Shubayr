// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'product_availability.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductAvailability _$ProductAvailabilityFromJson(Map<String, dynamic> json) =>
    ProductAvailability(
      productId: json['product_id'] as String,
      inStock: json['in_stock'] as bool,
      availableQty: (json['available_qty'] as num).toInt(),
      variants:
          (json['variants'] as List<dynamic>?)
              ?.map(
                (e) => VariantAvailability.fromJson(e as Map<String, dynamic>),
              )
              .toList() ??
          const [],
    );

Map<String, dynamic> _$ProductAvailabilityToJson(
  ProductAvailability instance,
) => <String, dynamic>{
  'product_id': instance.productId,
  'in_stock': instance.inStock,
  'available_qty': instance.availableQty,
  'variants': instance.variants.map((e) => e.toJson()).toList(),
};

VariantAvailability _$VariantAvailabilityFromJson(Map<String, dynamic> json) =>
    VariantAvailability(
      variantId: json['variant_id'] as String?,
      sku: json['sku'] as String? ?? '',
      availableQty: (json['available_qty'] as num).toInt(),
      inStock: json['in_stock'] as bool,
    );

Map<String, dynamic> _$VariantAvailabilityToJson(
  VariantAvailability instance,
) => <String, dynamic>{
  'variant_id': instance.variantId,
  'sku': instance.sku,
  'available_qty': instance.availableQty,
  'in_stock': instance.inStock,
};
