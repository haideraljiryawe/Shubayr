// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'order_tracking.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OrderTracking _$OrderTrackingFromJson(Map<String, dynamic> json) =>
    OrderTracking(
      orderId: json['order_id'] as String? ?? '',
      events:
          (json['events'] as List<dynamic>?)
              ?.map((e) => OrderEvent.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
    );

Map<String, dynamic> _$OrderTrackingToJson(OrderTracking instance) =>
    <String, dynamic>{
      'order_id': instance.orderId,
      'events': instance.events.map((e) => e.toJson()).toList(),
    };

OrderEvent _$OrderEventFromJson(Map<String, dynamic> json) => OrderEvent(
  status: json['status'] as String,
  note: json['note'] as String?,
  at: json['at'] == null ? null : DateTime.parse(json['at'] as String),
);

Map<String, dynamic> _$OrderEventToJson(OrderEvent instance) =>
    <String, dynamic>{
      'status': instance.status,
      'note': instance.note,
      'at': instance.at?.toIso8601String(),
    };
