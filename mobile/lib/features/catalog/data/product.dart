import 'package:json_annotation/json_annotation.dart';

part 'product.g.dart';

/// A purchasable variant of a product. Shapes match `ProductVariant` in
/// `api/openapi.yaml`.
@JsonSerializable()
class ProductVariant {
  const ProductVariant({
    required this.id,
    this.sku = '',
    this.attributes = const {},
    this.priceDelta = 0,
  });

  final String id;
  final String sku;
  final Map<String, dynamic> attributes;
  @JsonKey(name: 'price_delta')
  final num priceDelta;

  factory ProductVariant.fromJson(Map<String, dynamic> json) =>
      _$ProductVariantFromJson(json);

  Map<String, dynamic> toJson() => _$ProductVariantToJson(this);
}

/// A catalog product. Shapes match the `Product` schema in
/// `api/openapi.yaml`. `inStock` and `availableQty` are computed by the API at
/// read time — never edited on the client.
@JsonSerializable(explicitToJson: true)
class Product {
  const Product({
    required this.id,
    required this.categoryId,
    required this.nameEn,
    required this.nameAr,
    this.description = '',
    this.salePrice = 0,
    this.isNegotiable = false,
    this.floorPrice,
    this.pointsPrice,
    this.tracksExpiry = false,
    this.ratingAvg = 0,
    this.status = 'active',
    this.inStock = true,
    this.availableQty = 0,
    this.images = const [],
    this.variants = const [],
  });

  final String id;
  @JsonKey(name: 'category_id')
  final String categoryId;
  @JsonKey(name: 'name_en')
  final String nameEn;
  @JsonKey(name: 'name_ar')
  final String nameAr;
  final String description;
  @JsonKey(name: 'sale_price')
  final num salePrice;
  @JsonKey(name: 'is_negotiable')
  final bool isNegotiable;
  @JsonKey(name: 'floor_price')
  final num? floorPrice;
  @JsonKey(name: 'points_price')
  final int? pointsPrice;
  @JsonKey(name: 'tracks_expiry')
  final bool tracksExpiry;
  @JsonKey(name: 'rating_avg')
  final num ratingAvg;
  final String status;
  @JsonKey(name: 'in_stock')
  final bool inStock;
  @JsonKey(name: 'available_qty')
  final int availableQty;
  final List<String> images;
  final List<ProductVariant> variants;

  /// The name for the active language, falling back to the other side.
  String localizedName(String languageCode) {
    if (languageCode == 'ar') return nameAr.isNotEmpty ? nameAr : nameEn;
    return nameEn.isNotEmpty ? nameEn : nameAr;
  }

  /// First image, or null when the product has none (the UI shows a placeholder).
  String? get primaryImage => images.isNotEmpty ? images.first : null;

  factory Product.fromJson(Map<String, dynamic> json) =>
      _$ProductFromJson(json);

  Map<String, dynamic> toJson() => _$ProductToJson(this);
}
