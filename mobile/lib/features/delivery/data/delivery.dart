import 'package:json_annotation/json_annotation.dart';

part 'delivery.g.dart';

/// The delivery contract contains references, not customer/order details.
@JsonSerializable()
class Delivery {
  const Delivery({
    required this.id,
    required this.orderId,
    this.agentId,
    required this.status,
    this.deliveryFee = 0,
    this.currency,
    this.dispatchedAt,
    this.deliveredAt,
  });

  final String id;
  @JsonKey(name: 'order_id')
  final String orderId;
  @JsonKey(name: 'agent_id')
  final String? agentId;
  final String status;
  @JsonKey(name: 'delivery_fee')
  final num deliveryFee;
  @JsonKey(includeIfNull: false)
  final String? currency;
  @JsonKey(name: 'dispatched_at')
  final DateTime? dispatchedAt;
  @JsonKey(name: 'delivered_at')
  final DateTime? deliveredAt;

  static const statuses = [
    'assigned',
    'out_for_delivery',
    'delivered',
    'failed',
    'returned',
  ];
  // PATCH permits these values; the contract specifies no transition graph.
  static const updateStatuses = ['out_for_delivery', 'delivered', 'failed'];

  factory Delivery.fromJson(Map<String, dynamic> json) =>
      _$DeliveryFromJson(json);
  Map<String, dynamic> toJson() => _$DeliveryToJson(this);
}

@JsonSerializable(explicitToJson: true)
class DeliveryPage {
  const DeliveryPage({
    this.page = 1,
    this.perPage = 20,
    this.total = 0,
    this.data = const [],
  });
  final int page;
  @JsonKey(name: 'per_page')
  final int perPage;
  final int total;
  final List<Delivery> data;

  factory DeliveryPage.fromJson(Map<String, dynamic> json) =>
      _$DeliveryPageFromJson(json);
  Map<String, dynamic> toJson() => _$DeliveryPageToJson(this);
}
