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
  currency: json['currency'] as String?,
);

Map<String, dynamic> _$CartToJson(Cart instance) => <String, dynamic>{
  'id': instance.id,
  'items': instance.items.map((e) => e.toJson()).toList(),
  'subtotal': instance.subtotal,
  'currency': ?instance.currency,
};

CartItem _$CartItemFromJson(Map<String, dynamic> json) => CartItem(
  id: json['id'] as String,
  productId: json['product_id'] as String,
  variantId: json['variant_id'] as String?,
  quantity: json['quantity'] as num? ?? 1,
  unitPrice: json['unit_price'] as num? ?? 0,
  availableQty: json['available_qty'] as num?,
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
};
