import 'package:json_annotation/json_annotation.dart';
import '../../../core/error/failure.dart';

part 'return_request.g.dart';

/// Customer-visible subset of the API's Return / ReturnItem response.
@JsonSerializable(explicitToJson: true)
class ReturnRequest {
  const ReturnRequest({
    required this.id,
    required this.orderId,
    this.status = 'requested',
    this.reason,
    this.items = const [],
    this.documentNumber,
    this.currency,
    this.expectedRefund,
    this.refundAmount,
    this.deliveryFeeRefund,
    this.uncollectedOffset,
    this.cashRefundAmount,
    this.pointsEffect,
    this.events = const [],
    this.refundPayments = const [],
  });

  final String id;
  @JsonKey(name: 'order_id')
  final String orderId;
  final String status;
  final String? reason;
  final List<ReturnRequestItem> items;
  @JsonKey(name: 'document_number')
  final String? documentNumber;
  final String? currency;
  @JsonKey(name: 'expected_refund')
  final num? expectedRefund;
  @JsonKey(name: 'refund_amount')
  final num? refundAmount;
  @JsonKey(name: 'delivery_fee_refund')
  final num? deliveryFeeRefund;
  @JsonKey(name: 'uncollected_offset')
  final num? uncollectedOffset;
  @JsonKey(name: 'cash_refund_amount')
  final num? cashRefundAmount;
  @JsonKey(name: 'points_effect')
  final ReturnPointsEffect? pointsEffect;
  final List<ReturnEvent> events;
  @JsonKey(name: 'refund_payments')
  final List<ReturnPayment> refundPayments;

  factory ReturnRequest.fromJson(Map<String, dynamic> json) {
    // Missing history is unknown, never an empty request or a guessed status.
    if (json['status'] is! String ||
        json['items'] is! List ||
        (json['items'] as List).isEmpty) {
      throw const AppFailure(FailureKind.server);
    }
    return _$ReturnRequestFromJson(json);
  }
  Map<String, dynamic> toJson() => _$ReturnRequestToJson(this);
}

@JsonSerializable()
class ReturnRequestItem {
  const ReturnRequestItem({
    required this.orderItemId,
    required this.quantity,
    this.approvedQuantity,
    this.reason,
    this.baseUnit,
    this.wholeUnitsOnly,
    this.reasonCode,
    this.productNameAr,
    this.productNameEn,
    this.netAmount,
    this.approvedRefund,
    this.condition,
    this.discountShare,
  });

  @JsonKey(name: 'order_item_id')
  final String orderItemId;
  final num quantity;
  @JsonKey(name: 'reason_code')
  final String? reasonCode;
  @JsonKey(name: 'product_name_ar')
  final String? productNameAr;
  @JsonKey(name: 'product_name_en')
  final String? productNameEn;
  @JsonKey(name: 'net_amount')
  final num? netAmount;
  @JsonKey(name: 'approved_refund')
  final num? approvedRefund;
  @JsonKey(name: 'discount_share')
  final num? discountShare;
  final String? condition;
  @JsonKey(name: 'base_unit', includeIfNull: false)
  final String? baseUnit;
  @JsonKey(name: 'whole_units_only', includeIfNull: false)
  final bool? wholeUnitsOnly;
  @JsonKey(name: 'approved_quantity', includeIfNull: false)
  final num? approvedQuantity;
  @JsonKey(name: 'customer_reason', includeIfNull: false)
  final String? reason;

  factory ReturnRequestItem.fromJson(Map<String, dynamic> json) =>
      _$ReturnRequestItemFromJson(json);
  Map<String, dynamic> toJson() => _$ReturnRequestItemToJson(this);
}

/// Caller-owned return history; every page is required before proving absence.
@JsonSerializable(explicitToJson: true)
class ReturnPage {
  const ReturnPage({
    required this.page,
    required this.perPage,
    required this.total,
    required this.data,
  });
  final int page;
  @JsonKey(name: 'per_page')
  final int perPage;
  final int total;
  final List<ReturnRequest> data;
  factory ReturnPage.fromJson(Map<String, dynamic> json) =>
      _$ReturnPageFromJson(json);
  Map<String, dynamic> toJson() => _$ReturnPageToJson(this);
}

const returnReasonCodes = [
  'change_of_mind',
  'defect',
  'store_error',
  'wrong_item',
  'other',
];

@JsonSerializable(fieldRename: FieldRename.snake)
class ReturnPointsEffect {
  const ReturnPointsEffect({
    required this.earnedReversed,
    required this.redeemedRestored,
    required this.net,
  });
  final int earnedReversed, redeemedRestored, net;
  factory ReturnPointsEffect.fromJson(Map<String, dynamic> json) =>
      _$ReturnPointsEffectFromJson(json);
  Map<String, dynamic> toJson() => _$ReturnPointsEffectToJson(this);
}

@JsonSerializable(fieldRename: FieldRename.snake)
class ReturnEvent {
  const ReturnEvent({required this.type, required this.createdAt, this.note});
  final String type;
  final DateTime createdAt;
  final String? note;
  factory ReturnEvent.fromJson(Map<String, dynamic> json) =>
      _$ReturnEventFromJson(json);
  Map<String, dynamic> toJson() => _$ReturnEventToJson(this);
}

@JsonSerializable(fieldRename: FieldRename.snake)
class ReturnPayment {
  const ReturnPayment({
    required this.method,
    required this.amountIqd,
    required this.createdAt,
    this.proofReference,
  });
  final String method;
  final num amountIqd;
  final DateTime createdAt;
  final String? proofReference;
  factory ReturnPayment.fromJson(Map<String, dynamic> json) =>
      _$ReturnPaymentFromJson(json);
  Map<String, dynamic> toJson() => _$ReturnPaymentToJson(this);
}
