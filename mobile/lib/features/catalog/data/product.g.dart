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
    );

Map<String, dynamic> _$ProductVariantToJson(ProductVariant instance) =>
    <String, dynamic>{
      'id': instance.id,
      'sku': instance.sku,
      'attributes': instance.attributes,
      'price_delta': instance.priceDelta,
    };

Product _$ProductFromJson(Map<String, dynamic> json) => Product(
  id: json['id'] as String,
  categoryId: json['category_id'] as String,
  nameEn: json['name_en'] as String,
  nameAr: json['name_ar'] as String,
  description: json['description'] as String? ?? '',
  salePrice: json['sale_price'] as num? ?? 0,
  compareAtPrice: json['compare_at_price'] as num?,
  discountPercent: (json['discount_percent'] as num?)?.toInt(),
  isNegotiable: json['is_negotiable'] as bool? ?? false,
  floorPrice: json['floor_price'] as num?,
  pointsPrice: (json['points_price'] as num?)?.toInt(),
  tracksExpiry: json['tracks_expiry'] as bool? ?? false,
  ratingAvg: json['rating_avg'] as num? ?? 0,
  status: json['status'] as String? ?? 'active',
  inStock: json['in_stock'] as bool? ?? true,
  availableQty: (json['available_qty'] as num?)?.toInt() ?? 0,
  images:
      (json['images'] as List<dynamic>?)?.map((e) => e as String).toList() ??
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
  'sale_price': instance.salePrice,
  'compare_at_price': instance.compareAtPrice,
  'discount_percent': instance.discountPercent,
  'is_negotiable': instance.isNegotiable,
  'floor_price': instance.floorPrice,
  'points_price': instance.pointsPrice,
  'tracks_expiry': instance.tracksExpiry,
  'rating_avg': instance.ratingAvg,
  'status': instance.status,
  'in_stock': instance.inStock,
  'available_qty': instance.availableQty,
  'images': instance.images,
  'variants': instance.variants.map((e) => e.toJson()).toList(),
};
