// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'product.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductVariant _$ProductVariantFromJson(Map<String, dynamic> json) =>
    ProductVariant(
      id: json['id'] as String,
      sku: json['sku'] as String? ?? '',
      attributes: json['attributes'] as Map<String, dynamic>? ?? const {},
      priceDelta: json['price_delta'] as num? ?? 0,
      effectivePrice: json['effective_price'] as num? ?? 0,
      currencyCode: json['currency_code'] as String?,
      currency: json['currency'] as String?,
      baseUnit: json['base_unit'] as String?,
      wholeUnitsOnly: json['whole_units_only'] as bool? ?? true,
      availableQty: json['available_qty'] as num?,
      inStock: json['in_stock'] as bool?,
      lowStockThreshold: json['low_stock_threshold'] as num?,
    );

Map<String, dynamic> _$ProductVariantToJson(ProductVariant instance) =>
    <String, dynamic>{
      'id': instance.id,
      'sku': instance.sku,
      'attributes': instance.attributes,
      'price_delta': instance.priceDelta,
      'effective_price': instance.effectivePrice,
      'currency_code': ?instance.currencyCode,
      'currency': ?instance.currency,
      'base_unit': ?instance.baseUnit,
      'whole_units_only': instance.wholeUnitsOnly,
      'available_qty': ?instance.availableQty,
      'in_stock': ?instance.inStock,
      'low_stock_threshold': ?instance.lowStockThreshold,
    };

Product _$ProductFromJson(Map<String, dynamic> json) => Product(
  id: json['id'] as String,
  categoryId: json['category_id'] as String,
  nameEn: json['name_en'] as String,
  nameAr: json['name_ar'] as String,
  description: json['description'] as String? ?? '',
  price: json['price'] as num? ?? 0,
  currency: json['currency'] as String?,
  discountType: json['discount_type'] as String?,
  discountValue: json['discount_value'] as num?,
  discountStartsAt: json['discount_starts_at'] == null
      ? null
      : DateTime.parse(json['discount_starts_at'] as String),
  discountEndsAt: json['discount_ends_at'] == null
      ? null
      : DateTime.parse(json['discount_ends_at'] as String),
  onSale: json['on_sale'] as bool? ?? false,
  discountedPrice: json['discounted_price'] as num?,
  effectivePrice: json['effective_price'] as num?,
  discountPercent: (json['discount_percent'] as num?)?.toInt(),
  isNegotiable: json['is_negotiable'] as bool? ?? false,
  floorPrice: json['floor_price'] as num?,
  pointsPrice: (json['points_price'] as num?)?.toInt(),
  tracksExpiry: json['tracks_expiry'] as bool? ?? false,
  ratingAvg: json['rating_avg'] as num? ?? 0,
  status: json['status'] as String? ?? 'active',
  inStock: json['in_stock'] as bool? ?? true,
  availableQty: json['available_qty'] as num? ?? 0,
  media:
      (json['images'] as List<dynamic>?)
          ?.map((e) => ProductImage.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
  variants:
      (json['variants'] as List<dynamic>?)
          ?.map((e) => ProductVariant.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
);

Map<String, dynamic> _$ProductToJson(Product instance) => <String, dynamic>{
  'id': instance.id,
  'category_id': instance.categoryId,
  'name_en': instance.nameEn,
  'name_ar': instance.nameAr,
  'description': instance.description,
  'price': instance.price,
  'currency': ?instance.currency,
  'discount_type': instance.discountType,
  'discount_value': instance.discountValue,
  'discount_starts_at': instance.discountStartsAt?.toIso8601String(),
  'discount_ends_at': instance.discountEndsAt?.toIso8601String(),
  'on_sale': instance.onSale,
  'discounted_price': instance.discountedPrice,
  'effective_price': instance.effectivePrice,
  'discount_percent': instance.discountPercent,
  'is_negotiable': instance.isNegotiable,
  'floor_price': instance.floorPrice,
  'points_price': instance.pointsPrice,
  'tracks_expiry': instance.tracksExpiry,
  'rating_avg': instance.ratingAvg,
  'status': instance.status,
  'in_stock': instance.inStock,
  'available_qty': instance.availableQty,
  'images': instance.media.map((e) => e.toJson()).toList(),
  'variants': instance.variants.map((e) => e.toJson()).toList(),
};

ProductImage _$ProductImageFromJson(Map<String, dynamic> json) => ProductImage(
  id: json['id'] as String,
  url: json['url'] as String,
  sortOrder: (json['sort_order'] as num).toInt(),
  isPrimary: json['is_primary'] as bool,
);

Map<String, dynamic> _$ProductImageToJson(ProductImage instance) =>
    <String, dynamic>{
      'id': instance.id,
      'url': instance.url,
      'sort_order': instance.sortOrder,
      'is_primary': instance.isPrimary,
    };
