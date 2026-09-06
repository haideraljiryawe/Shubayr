// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Review _$ReviewFromJson(Map<String, dynamic> json) => Review(
  id: json['id'] as String,
  productId: json['product_id'] as String,
  userId: json['user_id'] as String?,
  orderItemId: json['order_item_id'] as String?,
  rating: (json['rating'] as num).toInt(),
  comment: json['comment'] as String?,
  verifiedPurchase: json['verified_purchase'] as bool? ?? false,
  status: json['status'] as String? ?? 'published',
  createdAt: DateTime.parse(json['created_at'] as String),
);

Map<String, dynamic> _$ReviewToJson(Review instance) => <String, dynamic>{
  'id': instance.id,
  'product_id': instance.productId,
  'user_id': instance.userId,
  'order_item_id': instance.orderItemId,
  'rating': instance.rating,
  'comment': instance.comment,
  'verified_purchase': instance.verifiedPurchase,
  'status': instance.status,
  'created_at': instance.createdAt.toIso8601String(),
};

ReviewPage _$ReviewPageFromJson(Map<String, dynamic> json) => ReviewPage(
  page: (json['page'] as num?)?.toInt() ?? 1,
  perPage: (json['per_page'] as num?)?.toInt() ?? 20,
  total: (json['total'] as num?)?.toInt() ?? 0,
  data:
      (json['data'] as List<dynamic>?)
          ?.map((e) => Review.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
);

Map<String, dynamic> _$ReviewPageToJson(ReviewPage instance) =>
    <String, dynamic>{
      'page': instance.page,
      'per_page': instance.perPage,
      'total': instance.total,
      'data': instance.data.map((e) => e.toJson()).toList(),
    };
