// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'delivery_detail.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeliveryDetail _$DeliveryDetailFromJson(Map<String, dynamic> json) =>
    DeliveryDetail(
      id: json['id'] as String,
      orderId: json['order_id'] as String,
      orderNumber: json['order_number'] as String,
      orderVersion: (json['order_version'] as num).toInt(),
      status: json['status'] as String,
      currency: json['currency'] as String,
      amountDue: json['amount_due'] as num,
      recipientName: json['recipient_name'] as String?,
      recipientPhone: json['recipient_phone'] as String?,
      shippingAddress: json['shipping_address'] == null
          ? null
          : DeliveryAddress.fromJson(
              json['shipping_address'] as Map<String, dynamic>,
            ),
      items: (json['items'] as List<dynamic>)
          .map((e) => DeliveryItem.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$DeliveryDetailToJson(DeliveryDetail instance) =>
    <String, dynamic>{
      'id': instance.id,
      'order_id': instance.orderId,
      'order_number': instance.orderNumber,
      'status': instance.status,
      'currency': instance.currency,
      'order_version': instance.orderVersion,
      'amount_due': instance.amountDue,
      'recipient_name': instance.recipientName,
      'recipient_phone': instance.recipientPhone,
      'shipping_address': instance.shippingAddress?.toJson(),
      'items': instance.items.map((e) => e.toJson()).toList(),
    };

DeliveryAddress _$DeliveryAddressFromJson(Map<String, dynamic> json) =>
    DeliveryAddress(
      label: json['label'] as String?,
      city: json['city'] as String,
      area: json['area'] as String?,
      street: json['street'] as String?,
      details: json['details'] as String?,
      lat: (json['lat'] as num?)?.toDouble(),
      lng: (json['lng'] as num?)?.toDouble(),
    );

Map<String, dynamic> _$DeliveryAddressToJson(DeliveryAddress instance) =>
    <String, dynamic>{
      'city': instance.city,
      'label': instance.label,
      'area': instance.area,
      'street': instance.street,
      'details': instance.details,
      'lat': instance.lat,
      'lng': instance.lng,
    };

DeliveryItem _$DeliveryItemFromJson(Map<String, dynamic> json) => DeliveryItem(
  id: json['id'] as String,
  productNameAr: json['product_name_ar'] as String,
  productNameEn: json['product_name_en'] as String,
  variantId: json['variant_id'] as String,
  variantSku: json['variant_sku'] as String,
  variantAttributes: json['variant_attributes'] as Map<String, dynamic>?,
  quantity: json['quantity'] as num,
  baseUnit: json['base_unit'] as String,
  wholeUnitsOnly: json['whole_units_only'] as bool,
  unitPrice: json['unit_price'] as num,
  lineTotal: json['line_total'] as num,
  currency: json['currency'] as String,
);

Map<String, dynamic> _$DeliveryItemToJson(DeliveryItem instance) =>
    <String, dynamic>{
      'id': instance.id,
      'product_name_ar': instance.productNameAr,
      'product_name_en': instance.productNameEn,
      'variant_id': instance.variantId,
      'variant_sku': instance.variantSku,
      'base_unit': instance.baseUnit,
      'currency': instance.currency,
      'variant_attributes': instance.variantAttributes,
      'quantity': instance.quantity,
      'unit_price': instance.unitPrice,
      'line_total': instance.lineTotal,
      'whole_units_only': instance.wholeUnitsOnly,
    };

DeliveryCollection _$DeliveryCollectionFromJson(Map<String, dynamic> json) =>
    DeliveryCollection(
      status: json['status'] as String,
      dueAmount: json['due_amount'] as num,
      collectedAmount: json['collected_amount'] as num?,
      shortfallAmount: json['shortfall_amount'] as num?,
      currency: json['currency'] as String,
    );

Map<String, dynamic> _$DeliveryCollectionToJson(DeliveryCollection instance) =>
    <String, dynamic>{
      'status': instance.status,
      'currency': instance.currency,
      'due_amount': instance.dueAmount,
      'collected_amount': instance.collectedAmount,
      'shortfall_amount': instance.shortfallAmount,
    };
