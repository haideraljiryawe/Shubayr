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
      documentNumber: json['document_number'] as String?,
      currency: json['currency'] as String?,
      expectedRefund: json['expected_refund'] as num?,
      refundAmount: json['refund_amount'] as num?,
      deliveryFeeRefund: json['delivery_fee_refund'] as num?,
      uncollectedOffset: json['uncollected_offset'] as num?,
      cashRefundAmount: json['cash_refund_amount'] as num?,
      pointsEffect: json['points_effect'] == null
          ? null
          : ReturnPointsEffect.fromJson(
              json['points_effect'] as Map<String, dynamic>,
            ),
      events:
          (json['events'] as List<dynamic>?)
              ?.map((e) => ReturnEvent.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      refundPayments:
          (json['refund_payments'] as List<dynamic>?)
              ?.map((e) => ReturnPayment.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
    );

Map<String, dynamic> _$ReturnRequestToJson(
  ReturnRequest instance,
) => <String, dynamic>{
  'id': instance.id,
  'order_id': instance.orderId,
  'status': instance.status,
  'reason': instance.reason,
  'items': instance.items.map((e) => e.toJson()).toList(),
  'document_number': instance.documentNumber,
  'currency': instance.currency,
  'expected_refund': instance.expectedRefund,
  'refund_amount': instance.refundAmount,
  'delivery_fee_refund': instance.deliveryFeeRefund,
  'uncollected_offset': instance.uncollectedOffset,
  'cash_refund_amount': instance.cashRefundAmount,
  'points_effect': instance.pointsEffect?.toJson(),
  'events': instance.events.map((e) => e.toJson()).toList(),
  'refund_payments': instance.refundPayments.map((e) => e.toJson()).toList(),
};

ReturnRequestItem _$ReturnRequestItemFromJson(Map<String, dynamic> json) =>
    ReturnRequestItem(
      orderItemId: json['order_item_id'] as String,
      quantity: json['quantity'] as num,
      approvedQuantity: json['approved_quantity'] as num?,
      reason: json['customer_reason'] as String?,
      baseUnit: json['base_unit'] as String?,
      wholeUnitsOnly: json['whole_units_only'] as bool?,
      reasonCode: json['reason_code'] as String?,
      productNameAr: json['product_name_ar'] as String?,
      productNameEn: json['product_name_en'] as String?,
      netAmount: json['net_amount'] as num?,
      approvedRefund: json['approved_refund'] as num?,
      condition: json['condition'] as String?,
      discountShare: json['discount_share'] as num?,
    );

Map<String, dynamic> _$ReturnRequestItemToJson(ReturnRequestItem instance) =>
    <String, dynamic>{
      'order_item_id': instance.orderItemId,
      'quantity': instance.quantity,
      'reason_code': instance.reasonCode,
      'product_name_ar': instance.productNameAr,
      'product_name_en': instance.productNameEn,
      'net_amount': instance.netAmount,
      'approved_refund': instance.approvedRefund,
      'discount_share': instance.discountShare,
      'condition': instance.condition,
      'base_unit': ?instance.baseUnit,
      'whole_units_only': ?instance.wholeUnitsOnly,
      'approved_quantity': ?instance.approvedQuantity,
      'customer_reason': ?instance.reason,
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

ReturnPointsEffect _$ReturnPointsEffectFromJson(Map<String, dynamic> json) =>
    ReturnPointsEffect(
      earnedReversed: (json['earned_reversed'] as num).toInt(),
      redeemedRestored: (json['redeemed_restored'] as num).toInt(),
      net: (json['net'] as num).toInt(),
    );

Map<String, dynamic> _$ReturnPointsEffectToJson(ReturnPointsEffect instance) =>
    <String, dynamic>{
      'earned_reversed': instance.earnedReversed,
      'redeemed_restored': instance.redeemedRestored,
      'net': instance.net,
    };

ReturnEvent _$ReturnEventFromJson(Map<String, dynamic> json) => ReturnEvent(
  type: json['type'] as String,
  createdAt: DateTime.parse(json['created_at'] as String),
  note: json['note'] as String?,
);

Map<String, dynamic> _$ReturnEventToJson(ReturnEvent instance) =>
    <String, dynamic>{
      'type': instance.type,
      'created_at': instance.createdAt.toIso8601String(),
      'note': instance.note,
    };

ReturnPayment _$ReturnPaymentFromJson(Map<String, dynamic> json) =>
    ReturnPayment(
      method: json['method'] as String,
      amountIqd: json['amount_iqd'] as num,
      createdAt: DateTime.parse(json['created_at'] as String),
      proofReference: json['proof_reference'] as String?,
    );

Map<String, dynamic> _$ReturnPaymentToJson(ReturnPayment instance) =>
    <String, dynamic>{
      'method': instance.method,
      'amount_iqd': instance.amountIqd,
      'created_at': instance.createdAt.toIso8601String(),
      'proof_reference': instance.proofReference,
    };
