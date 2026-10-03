import 'package:json_annotation/json_annotation.dart';

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

  factory ReturnRequest.fromJson(Map<String, dynamic> json) =>
      _$ReturnRequestFromJson(json);
  Map<String, dynamic> toJson() => _$ReturnRequestToJson(this);
}

@JsonSerializable()
class ReturnRequestItem {
  const ReturnRequestItem({required this.orderItemId, required this.quantity});

  @JsonKey(name: 'order_item_id')
  final String orderItemId;
  final num quantity;

  factory ReturnRequestItem.fromJson(Map<String, dynamic> json) =>
      _$ReturnRequestItemFromJson(json);
  Map<String, dynamic> toJson() => _$ReturnRequestItemToJson(this);
}
