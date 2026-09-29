// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'delivery.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Delivery _$DeliveryFromJson(Map<String, dynamic> json) => Delivery(
  id: json['id'] as String,
  orderId: json['order_id'] as String,
  agentId: json['agent_id'] as String?,
  status: json['status'] as String,
  deliveryFee: json['delivery_fee'] as num? ?? 0,
  currency: json['currency'] as String?,
  dispatchedAt: json['dispatched_at'] == null
      ? null
      : DateTime.parse(json['dispatched_at'] as String),
  deliveredAt: json['delivered_at'] == null
      ? null
      : DateTime.parse(json['delivered_at'] as String),
);

Map<String, dynamic> _$DeliveryToJson(Delivery instance) => <String, dynamic>{
  'id': instance.id,
  'order_id': instance.orderId,
  'agent_id': instance.agentId,
  'status': instance.status,
  'delivery_fee': instance.deliveryFee,
  'currency': ?instance.currency,
  'dispatched_at': instance.dispatchedAt?.toIso8601String(),
  'delivered_at': instance.deliveredAt?.toIso8601String(),
};

DeliveryPage _$DeliveryPageFromJson(Map<String, dynamic> json) => DeliveryPage(
  page: (json['page'] as num?)?.toInt() ?? 1,
  perPage: (json['per_page'] as num?)?.toInt() ?? 20,
  total: (json['total'] as num?)?.toInt() ?? 0,
  data:
      (json['data'] as List<dynamic>?)
          ?.map((e) => Delivery.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
);

Map<String, dynamic> _$DeliveryPageToJson(DeliveryPage instance) =>
    <String, dynamic>{
      'page': instance.page,
      'per_page': instance.perPage,
      'total': instance.total,
      'data': instance.data.map((e) => e.toJson()).toList(),
    };
