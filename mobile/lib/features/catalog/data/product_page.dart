import 'package:json_annotation/json_annotation.dart';

import 'product.dart';

part 'product_page.g.dart';

/// One page of products. Matches `ProductPage` (the shared `Pagination`
/// envelope plus a `data` array) in `api/openapi.yaml`.
@JsonSerializable(explicitToJson: true)
class ProductPage {
  const ProductPage({
    this.page = 1,
    this.perPage = 20,
    this.total = 0,
    this.data = const [],
  });

  final int page;
  @JsonKey(name: 'per_page')
  final int perPage;
  final int total;
  final List<Product> data;

  /// Whether another page exists after this one.
  bool get hasMore => page * perPage < total;

  factory ProductPage.fromJson(Map<String, dynamic> json) =>
      _$ProductPageFromJson(json);

  Map<String, dynamic> toJson() => _$ProductPageToJson(this);
}
