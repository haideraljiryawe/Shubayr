import 'package:json_annotation/json_annotation.dart';

import '../../../core/utils/quantity.dart';
import '../../../core/error/failure.dart';

part 'cart.g.dart';

/// The current user's cart. Shapes match `Cart` in `api/openapi.yaml`. The API
/// keeps the cart server-side, so it is only available while signed in.
@JsonSerializable(explicitToJson: true)
class Cart {
  const Cart({
    this.id,
    this.items = const [],
    this.subtotal = 0,
    this.discount = 0,
    this.deliveryFee = 0,
    this.total = 0,
    this.couponCode,
    this.currency,
  });

  final String? id;
  final List<CartItem> items;
  final num subtotal;
  final num discount;
  @JsonKey(name: 'delivery_fee')
  final num deliveryFee;
  final num total;
  @JsonKey(name: 'coupon_code')
  final String? couponCode;
  @JsonKey(includeIfNull: false)
  final String? currency;

  bool get isEmpty => items.isEmpty;
  bool get canCheckout =>
      !isEmpty && items.every((item) => item.available == true);

  /// Total number of units across all lines (for a future tab badge / count).
  num get count => items.fold<num>(0, (sum, i) => addQuantity(sum, i.quantity));

  factory Cart.fromJson(Map<String, dynamic> json) {
    for (final key in ['subtotal', 'discount', 'delivery_fee', 'total']) {
      _requireAmount(json[key]);
    }
    _requireCurrency(json['currency']);
    if (json['items'] is! List ||
        !json.containsKey('coupon_code') ||
        (json['coupon_code'] != null && json['coupon_code'] is! String)) {
      throw const AppFailure(FailureKind.server);
    }
    return _$CartFromJson(json);
  }

  Map<String, dynamic> toJson() => _$CartToJson(this);
}

/// One line in the cart. Carries ids, quantity and a priced `unit_price`; the
/// UI looks the product up (name/image/variant) via the catalog for display.
@JsonSerializable()
class CartItem {
  const CartItem({
    required this.id,
    required this.productId,
    this.variantId,
    this.quantity = 1,
    this.unitPrice = 0,
    this.lineTotal = 0,
    this.availableQty,
    this.available,
    this.currency,
  });

  final String id;
  @JsonKey(name: 'product_id')
  final String productId;
  @JsonKey(name: 'variant_id')
  final String? variantId;
  final num quantity;
  @JsonKey(name: 'unit_price')
  final num unitPrice;
  @JsonKey(includeIfNull: false)
  final String? currency;

  @JsonKey(name: 'available_qty', includeIfNull: false)
  final num? availableQty;
  @JsonKey(includeIfNull: false)
  final bool? available;

  /// Server snapshot, independent of local quantity edits or catalog prices.
  @JsonKey(name: 'line_total')
  final num lineTotal;

  CartItem copyWith({num? quantity, num? lineTotal}) => CartItem(
    id: id,
    productId: productId,
    variantId: variantId,
    quantity: quantity ?? this.quantity,
    unitPrice: unitPrice,
    lineTotal: lineTotal ?? this.lineTotal,
    currency: currency,
    availableQty: availableQty,
    available: available,
  );

  factory CartItem.fromJson(Map<String, dynamic> json) {
    for (final key in ['unit_price', 'line_total', 'available_qty']) {
      _requireAmount(json[key]);
    }
    _requireCurrency(json['currency']);
    if (json['available'] is! bool) {
      throw const AppFailure(FailureKind.server);
    }
    return _$CartItemFromJson(json);
  }

  Map<String, dynamic> toJson() => _$CartItemToJson(this);
}

void _requireAmount(Object? value) {
  if (value is! num || !value.isFinite || value < 0) {
    throw const AppFailure(FailureKind.server);
  }
}

void _requireCurrency(Object? value) {
  if (value is! String || !RegExp(r'^[A-Z]{3}$').hasMatch(value)) {
    throw const AppFailure(FailureKind.server);
  }
}
