import 'package:json_annotation/json_annotation.dart';

part 'order_tracking.g.dart';

/// The tracking timeline for an order. Matches `OrderTracking` in
/// `api/openapi.yaml`: an ordered list of status changes, each with an optional
/// note and a timestamp.
@JsonSerializable(explicitToJson: true)
class OrderTracking {
  const OrderTracking({this.orderId = '', this.events = const []});

  @JsonKey(name: 'order_id')
  final String orderId;
  final List<OrderEvent> events;

  factory OrderTracking.fromJson(Map<String, dynamic> json) =>
      _$OrderTrackingFromJson(json);

  Map<String, dynamic> toJson() => _$OrderTrackingToJson(this);
}

@JsonSerializable()
class OrderEvent {
  const OrderEvent({required this.status, this.note, this.at});

  final String status;
  final String? note;
  final DateTime? at;

  factory OrderEvent.fromJson(Map<String, dynamic> json) =>
      _$OrderEventFromJson(json);

  Map<String, dynamic> toJson() => _$OrderEventToJson(this);
}
