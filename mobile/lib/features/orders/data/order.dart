import 'package:json_annotation/json_annotation.dart';

part 'order.g.dart';

/// A placed order. Shapes match `Order` in `api/openapi.yaml`. Amounts are
/// computed by the server (subtotal, delivery fee, discount, total); the client
/// only sends the address and an optional coupon.
@JsonSerializable(explicitToJson: true)
class Order {
  const Order({
    required this.id,
    this.orderNumber = '',
    this.status = 'pending',
    this.paymentMethod = 'cod',
    this.addressId,
    this.subtotal = 0,
    this.deliveryFee = 0,
    this.discount = 0,
    this.total = 0,
    this.placedAt,
    this.items = const [],
  });

  final String id;
  @JsonKey(name: 'order_number')
  final String orderNumber;
  final String status;
  @JsonKey(name: 'payment_method')
  final String paymentMethod;
  @JsonKey(name: 'address_id')
  final String? addressId;
  final num subtotal;
  @JsonKey(name: 'delivery_fee')
  final num deliveryFee;
  final num discount;
  final num total;
  @JsonKey(name: 'placed_at')
  final DateTime? placedAt;
  final List<OrderItem> items;

  factory Order.fromJson(Map<String, dynamic> json) => _$OrderFromJson(json);

  Map<String, dynamic> toJson() => _$OrderToJson(this);
}

@JsonSerializable()
class OrderItem {
  const OrderItem({
    required this.id,
    required this.productId,
    this.variantId,
    this.quantity = 1,
    this.unitPrice = 0,
    this.lineTotal = 0,
  });

  final String id;
  @JsonKey(name: 'product_id')
  final String productId;
  @JsonKey(name: 'variant_id')
  final String? variantId;
  final int quantity;
  @JsonKey(name: 'unit_price')
  final num unitPrice;
  @JsonKey(name: 'line_total')
  final num lineTotal;

  factory OrderItem.fromJson(Map<String, dynamic> json) =>
      _$OrderItemFromJson(json);

  Map<String, dynamic> toJson() => _$OrderItemToJson(this);
}

/// One page of orders. Matches `OrderPage` in `api/openapi.yaml`.
@JsonSerializable(explicitToJson: true)
class OrderPage {
  const OrderPage({
    this.page = 1,
    this.perPage = 20,
    this.total = 0,
    this.data = const [],
  });

  final int page;
  @JsonKey(name: 'per_page')
  final int perPage;
  final int total;
  final List<Order> data;

  factory OrderPage.fromJson(Map<String, dynamic> json) =>
      _$OrderPageFromJson(json);

  Map<String, dynamic> toJson() => _$OrderPageToJson(this);
}
