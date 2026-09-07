// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'wishlist_item.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

WishlistItem _$WishlistItemFromJson(Map<String, dynamic> json) => WishlistItem(
  id: json['id'] as String,
  productId: json['product_id'] as String,
  addedAt: json['added_at'] == null
      ? null
      : DateTime.parse(json['added_at'] as String),
  product: json['product'] == null
      ? null
      : Product.fromJson(json['product'] as Map<String, dynamic>),
);

WishlistPage _$WishlistPageFromJson(Map<String, dynamic> json) => WishlistPage(
  page: (json['page'] as num?)?.toInt() ?? 1,
  perPage: (json['per_page'] as num?)?.toInt() ?? 20,
  total: (json['total'] as num?)?.toInt() ?? 0,
  data:
      (json['data'] as List<dynamic>?)
          ?.map((e) => WishlistItem.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
);
