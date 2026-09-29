import 'package:json_annotation/json_annotation.dart';

part 'order.g.dart';

const remoteOrderStatuses = [
  'pending',
  'confirmed',
  'preparing',
  'ready_for_dispatch',
  'dispatched',
  'delivered',
  'failed',
  'rejected',
  'cancelled',
  'return_requested',
  'returned',
];

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
    this.currency,
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
  @JsonKey(includeIfNull: false)
  final String? currency;
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
    this.productNameAr,
    this.productNameEn,
    this.imageUrl,
    bool? imageSnapshotProvided,
    this.quantity = 1,
    this.unitPrice = 0,
    this.lineTotal = 0,
    this.currency,
  }) : imageSnapshotProvided = imageSnapshotProvided ?? (imageUrl != null);

  final String id;
  @JsonKey(name: 'product_id')
  final String productId;
  @JsonKey(name: 'variant_id')
  final String? variantId;
  @JsonKey(name: 'product_name_ar', includeIfNull: false)
  final String? productNameAr;
  @JsonKey(name: 'product_name_en', includeIfNull: false)
  final String? productNameEn;
  @JsonKey(name: 'image_url')
  final String? imageUrl;

  /// Missing (legacy) and explicit null (no image at purchase) differ.
  /// Local decoding metadata only; never an API field.
  @JsonKey(includeFromJson: false, includeToJson: false)
  final bool imageSnapshotProvided;

  String? snapshotName(String language) {
    final names = language == 'ar'
        ? [productNameAr, productNameEn]
        : [productNameEn, productNameAr];
    for (final name in names) {
      if (name != null && name.trim().isNotEmpty) return name.trim();
    }
    return null;
  }

  final int quantity;
  @JsonKey(name: 'unit_price')
  final num unitPrice;
  @JsonKey(name: 'line_total')
  final num lineTotal;
  @JsonKey(includeIfNull: false)
  final String? currency;

  factory OrderItem.fromJson(Map<String, dynamic> json) {
    final item = _$OrderItemFromJson(json);
    return OrderItem(
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      currency: item.currency,
      productNameAr: item.productNameAr,
      productNameEn: item.productNameEn,
      imageUrl: item.imageUrl,
      imageSnapshotProvided: json.containsKey('image_url'),
    );
  }

  Map<String, dynamic> toJson() {
    final json = _$OrderItemToJson(this);
    if (!imageSnapshotProvided) json.remove('image_url');
    return json;
  }
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
