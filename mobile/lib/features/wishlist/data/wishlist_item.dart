import 'package:json_annotation/json_annotation.dart';

import '../../catalog/data/product.dart';

part 'wishlist_item.g.dart';

/// One saved product. Matches `WishlistItem` in `api/openapi.yaml`. The server
/// may embed the full [product]; when it doesn't, the UI looks it up by id.
/// Input-only (createToJson:false) — adding sends just a product id.
@JsonSerializable(createToJson: false)
class WishlistItem {
  const WishlistItem({
    required this.id,
    required this.productId,
    this.addedAt,
    this.product,
  });

  final String id;
  @JsonKey(name: 'product_id')
  final String productId;
  @JsonKey(name: 'added_at')
  final DateTime? addedAt;
  final Product? product;

  factory WishlistItem.fromJson(Map<String, dynamic> json) =>
      _$WishlistItemFromJson(json);
}

/// One page of wishlist items. Matches `WishlistPage` in `api/openapi.yaml`.
@JsonSerializable(createToJson: false)
class WishlistPage {
  const WishlistPage({
    this.page = 1,
    this.perPage = 20,
    this.total = 0,
    this.data = const [],
  });

  final int page;
  @JsonKey(name: 'per_page')
  final int perPage;
  final int total;
  final List<WishlistItem> data;

  factory WishlistPage.fromJson(Map<String, dynamic> json) =>
      _$WishlistPageFromJson(json);
}
