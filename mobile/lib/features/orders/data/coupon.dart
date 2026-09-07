import 'package:json_annotation/json_annotation.dart';

part 'coupon.g.dart';

/// A discount coupon. Shapes match `Coupon` in `api/openapi.yaml`.
@JsonSerializable()
class Coupon {
  const Coupon({required this.code, this.type = 'fixed', this.value = 0});

  final String code;

  /// `percentage` or `fixed`.
  final String type;
  final num value;

  /// The discount this coupon yields on a given subtotal (client-side estimate;
  /// the server recomputes the authoritative amount when the order is placed).
  num discountOn(num subtotal) {
    if (type == 'percentage') return subtotal * value / 100;
    return value > subtotal ? subtotal : value;
  }

  factory Coupon.fromJson(Map<String, dynamic> json) => _$CouponFromJson(json);

  Map<String, dynamic> toJson() => _$CouponToJson(this);
}
