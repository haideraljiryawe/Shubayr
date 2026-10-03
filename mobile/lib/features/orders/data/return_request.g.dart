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
      approvedQuantity: json['approved_quantity'] as num?,
    );

Map<String, dynamic> _$ReturnRequestItemToJson(ReturnRequestItem instance) =>
    <String, dynamic>{
      'order_item_id': instance.orderItemId,
      'quantity': instance.quantity,
      'approved_quantity': ?instance.approvedQuantity,
    };

ReturnPage _$ReturnPageFromJson(Map<String, dynamic> json) => ReturnPage(
  page: (json['page'] as num).toInt(),
  perPage: (json['per_page'] as num).toInt(),
  total: (json['total'] as num).toInt(),
  data: (json['data'] as List<dynamic>)
      .map((e) => ReturnRequest.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$ReturnPageToJson(ReturnPage instance) =>
    <String, dynamic>{
      'page': instance.page,
      'per_page': instance.perPage,
      'total': instance.total,
      'data': instance.data.map((e) => e.toJson()).toList(),
    };
