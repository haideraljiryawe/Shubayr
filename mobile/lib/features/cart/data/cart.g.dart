// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cart.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Cart _$CartFromJson(Map<String, dynamic> json) => Cart(
  id: json['id'] as String?,
  items:
      (json['items'] as List<dynamic>?)
          ?.map((e) => CartItem.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
  subtotal: json['subtotal'] as num? ?? 0,
  discount: json['discount'] as num? ?? 0,
  deliveryFee: json['delivery_fee'] as num? ?? 0,
  total: json['total'] as num? ?? 0,
  couponCode: json['coupon_code'] as String?,
  currency: json['currency'] as String?,
);

Map<String, dynamic> _$CartToJson(Cart instance) => <String, dynamic>{
  'id': instance.id,
  'items': instance.items.map((e) => e.toJson()).toList(),
  'subtotal': instance.subtotal,
  'discount': instance.discount,
  'delivery_fee': instance.deliveryFee,
  'total': instance.total,
  'coupon_code': instance.couponCode,
  'currency': ?instance.currency,
};

CartItem _$CartItemFromJson(Map<String, dynamic> json) => CartItem(
  id: json['id'] as String,
  productId: json['product_id'] as String,
  variantId: json['variant_id'] as String?,
  quantity: json['quantity'] as num? ?? 1,
  unitPrice: json['unit_price'] as num? ?? 0,
  lineTotal: json['line_total'] as num? ?? 0,
  availableQty: json['available_qty'] as num?,
  priceVersion: json['price_version'] as String?,
  currentUnitPrice: json['current_unit_price'] as num?,
  currentPriceVersion: json['current_price_version'] as String?,
  priceChanged: json['price_changed'] as bool? ?? false,
  available: json['available'] as bool?,
  currency: json['currency'] as String?,
);

Map<String, dynamic> _$CartItemToJson(CartItem instance) => <String, dynamic>{
  'id': instance.id,
  'product_id': instance.productId,
  'variant_id': instance.variantId,
  'quantity': instance.quantity,
  'unit_price': instance.unitPrice,
  'currency': ?instance.currency,
  'available_qty': ?instance.availableQty,
  'available': ?instance.available,
  'line_total': instance.lineTotal,
  'price_version': instance.priceVersion,
  'current_unit_price': instance.currentUnitPrice,
  'current_price_version': instance.currentPriceVersion,
  'price_changed': instance.priceChanged,
};
