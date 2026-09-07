import 'package:json_annotation/json_annotation.dart';

part 'cart.g.dart';

/// The current user's cart. Shapes match `Cart` in `api/openapi.yaml`. The API
/// keeps the cart server-side, so it is only available while signed in.
@JsonSerializable(explicitToJson: true)
class Cart {
  const Cart({this.id, this.items = const [], this.subtotal = 0});

  final String? id;
  final List<CartItem> items;
  final num subtotal;

  bool get isEmpty => items.isEmpty;

  /// Total number of units across all lines (for a future tab badge / count).
  int get count => items.fold(0, (sum, i) => sum + i.quantity);

  factory Cart.fromJson(Map<String, dynamic> json) => _$CartFromJson(json);

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
  });

  final String id;
  @JsonKey(name: 'product_id')
  final String productId;
  @JsonKey(name: 'variant_id')
  final String? variantId;
  final int quantity;
  @JsonKey(name: 'unit_price')
  final num unitPrice;

  num get lineTotal => unitPrice * quantity;

  CartItem copyWith({int? quantity}) => CartItem(
    id: id,
    productId: productId,
    variantId: variantId,
    quantity: quantity ?? this.quantity,
    unitPrice: unitPrice,
  );

  factory CartItem.fromJson(Map<String, dynamic> json) =>
      _$CartItemFromJson(json);

  Map<String, dynamic> toJson() => _$CartItemToJson(this);
}
