import 'package:json_annotation/json_annotation.dart';
import '../../../core/error/failure.dart';

part 'delivery.g.dart';

/// The delivery contract contains references, not customer/order details.
@JsonSerializable()
class Delivery {
  const Delivery({
    required this.id,
    required this.orderId,
    required this.amountDue,
    this.agentId,
    required this.status,
    this.orderVersion,
    this.failureReason,
    this.failedAt,
    this.retryCount = 0,
    this.deliveryFee = 0,
    this.currency,
    this.dispatchedAt,
    this.deliveredAt,
  });

  final String id;
  @JsonKey(name: 'order_id')
  final String orderId;
  @JsonKey(name: 'amount_due')
  final num amountDue;
  @JsonKey(name: 'agent_id')
  final String? agentId;
  final String status;
  @JsonKey(name: 'order_version')
  final int? orderVersion;
  @JsonKey(name: 'failure_reason')
  final String? failureReason;
  @JsonKey(name: 'failed_at')
  final DateTime? failedAt;
  @JsonKey(name: 'retry_count')
  final int retryCount;
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
  static const updateStatuses = [
    'out_for_delivery',
    'delivered',
    'failed',
    'returned',
  ];

  /// API 11 transitions. The server also checks order readiness before dispatch;
  /// that order state is intentionally absent from the Delivery response.
  @JsonKey(includeFromJson: false, includeToJson: false)
  List<String> get nextStatuses => switch (status) {
    'assigned' || 'failed' => const ['out_for_delivery'],
    'out_for_delivery' => const ['delivered', 'failed'],
    'delivered' => const ['returned'],
    _ => const [],
  };

  factory Delivery.fromJson(Map<String, dynamic> json) {
    if (json['amount_due'] is! num ||
        !(json['amount_due'] as num).isFinite ||
        (json['amount_due'] as num) < 0) {
      throw const FormatException('Invalid delivery amount due');
    }
    if (json['order_version'] is! int || (json['order_version'] as int) < 1) {
      throw const AppFailure(FailureKind.server);
    }
    return _$DeliveryFromJson(json);
  }
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
