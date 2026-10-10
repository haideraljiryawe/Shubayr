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
  });

  final String id;
  @JsonKey(name: 'order_id')
  final String orderId;
  final String status;
  final String? reason;
  final List<ReturnRequestItem> items;

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
  });

  @JsonKey(name: 'order_item_id')
  final String orderItemId;
  final num quantity;
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
