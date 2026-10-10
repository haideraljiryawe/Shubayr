// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'order.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Order _$OrderFromJson(Map<String, dynamic> json) => Order(
  id: json['id'] as String,
  orderNumber: json['order_number'] as String? ?? '',
  version: (json['version'] as num?)?.toInt(),
  status: json['status'] as String? ?? 'pending',
  paymentMethod: json['payment_method'] as String? ?? 'cod',
  addressId: json['address_id'] as String?,
  subtotal: json['subtotal'] as num? ?? 0,
  deliveryFee: json['delivery_fee'] as num? ?? 0,
  discount: json['discount'] as num? ?? 0,
  total: json['total'] as num? ?? 0,
  currency: json['currency'] as String?,
  placedAt: json['placed_at'] == null
      ? null
      : DateTime.parse(json['placed_at'] as String),
  items:
      (json['items'] as List<dynamic>?)
          ?.map((e) => OrderItem.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
);

Map<String, dynamic> _$OrderToJson(Order instance) => <String, dynamic>{
  'id': instance.id,
  'order_number': instance.orderNumber,
  'status': instance.status,
  'version': ?instance.version,
  'payment_method': instance.paymentMethod,
  'address_id': instance.addressId,
  'subtotal': instance.subtotal,
  'delivery_fee': instance.deliveryFee,
  'discount': instance.discount,
  'total': instance.total,
  'currency': ?instance.currency,
  'placed_at': instance.placedAt?.toIso8601String(),
  'items': instance.items.map((e) => e.toJson()).toList(),
};

OrderItem _$OrderItemFromJson(Map<String, dynamic> json) => OrderItem(
  id: json['id'] as String,
  productId: json['product_id'] as String,
  variantId: json['variant_id'] as String?,
  productNameAr: json['product_name_ar'] as String?,
  productNameEn: json['product_name_en'] as String?,
  imageUrl: json['image_url'] as String?,
  quantity: json['quantity'] as num? ?? 1,
  unitPrice: json['unit_price'] as num? ?? 0,
  lineTotal: json['line_total'] as num? ?? 0,
  reviewed: json['reviewed'] as bool?,
  currency: json['currency'] as String?,
);

Map<String, dynamic> _$OrderItemToJson(OrderItem instance) => <String, dynamic>{
  'id': instance.id,
  'product_id': instance.productId,
  'variant_id': instance.variantId,
  'product_name_ar': ?instance.productNameAr,
  'product_name_en': ?instance.productNameEn,
  'image_url': instance.imageUrl,
  'quantity': instance.quantity,
  'unit_price': instance.unitPrice,
  'line_total': instance.lineTotal,
  'reviewed': ?instance.reviewed,
  'currency': ?instance.currency,
};

OrderPage _$OrderPageFromJson(Map<String, dynamic> json) => OrderPage(
  page: (json['page'] as num?)?.toInt() ?? 1,
  perPage: (json['per_page'] as num?)?.toInt() ?? 20,
  total: (json['total'] as num?)?.toInt() ?? 0,
  data:
      (json['data'] as List<dynamic>?)
          ?.map((e) => Order.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
);

Map<String, dynamic> _$OrderPageToJson(OrderPage instance) => <String, dynamic>{
  'page': instance.page,
  'per_page': instance.perPage,
  'total': instance.total,
  'data': instance.data.map((e) => e.toJson()).toList(),
};
