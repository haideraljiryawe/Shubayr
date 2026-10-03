// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'return_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReturnRequest _$ReturnRequestFromJson(Map<String, dynamic> json) =>
    ReturnRequest(
      id: json['id'] as String,
      orderId: json['order_id'] as String,
      status: json['status'] as String? ?? 'requested',
      reason: json['reason'] as String?,
      items:
          (json['items'] as List<dynamic>?)
              ?.map(
                (e) => ReturnRequestItem.fromJson(e as Map<String, dynamic>),
              )
              .toList() ??
          const [],
    );

Map<String, dynamic> _$ReturnRequestToJson(ReturnRequest instance) =>
    <String, dynamic>{
      'id': instance.id,
      'order_id': instance.orderId,
      'status': instance.status,
      'reason': instance.reason,
      'items': instance.items.map((e) => e.toJson()).toList(),
    };

ReturnRequestItem _$ReturnRequestItemFromJson(Map<String, dynamic> json) =>
    ReturnRequestItem(
      orderItemId: json['order_item_id'] as String,
      quantity: json['quantity'] as num,
    );

Map<String, dynamic> _$ReturnRequestItemToJson(ReturnRequestItem instance) =>
    <String, dynamic>{
      'order_item_id': instance.orderItemId,
      'quantity': instance.quantity,
    };
