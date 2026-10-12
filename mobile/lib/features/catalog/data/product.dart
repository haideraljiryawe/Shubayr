import 'package:json_annotation/json_annotation.dart';

import '../../../core/error/failure.dart';
import 'media/catalog_image.dart';

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
    this.effectivePrice = 0,
    this.currencyCode,
    this.currency,
    this.baseUnit,
    this.wholeUnitsOnly = true,
    this.availableQty,
    this.inStock,
    this.lowStockThreshold,
  });

  final String id;
  final String sku;
  final Map<String, dynamic> attributes;
  @JsonKey(name: 'price_delta')
  final num priceDelta;
  @JsonKey(name: 'effective_price')
  final num effectivePrice;
  @JsonKey(name: 'currency_code', includeIfNull: false)
  final String? currencyCode;
  @JsonKey(includeIfNull: false)
  final String? currency;

  @JsonKey(name: 'base_unit', includeIfNull: false)
  final String? baseUnit;
  @JsonKey(name: 'whole_units_only')
  final bool wholeUnitsOnly;
  @JsonKey(name: 'available_qty', includeIfNull: false)
  final num? availableQty;
  @JsonKey(name: 'in_stock', includeIfNull: false)
  final bool? inStock;
  @JsonKey(name: 'low_stock_threshold', includeIfNull: false)
  final num? lowStockThreshold;

  factory ProductVariant.fromJson(Map<String, dynamic> json) {
    // The API's effective SKU price includes linked conversion and the product
    // discount. A delta or fixed override cannot reconstruct that value.
    _checkedPrice(json['effective_price']);
    return _$ProductVariantFromJson(json);
  }

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
    this.price = 0,
    this.currency,
    this.discountType,
    this.discountValue,
    this.discountStartsAt,
    this.discountEndsAt,
    this.onSale = false,
    this.discountedPrice,
    num? effectivePrice,
    this.discountPercent,
    this.isNegotiable = false,
    this.floorPrice,
    this.pointsPrice,
    this.tracksExpiry = false,
    this.ratingAvg = 0,
    this.status = 'active',
    this.inStock = true,
    this.availableQty = 0,
    this.media = const [],
    this.variants = const [],
  }) : effectivePrice = effectivePrice ?? price;

  final String id;
  @JsonKey(name: 'category_id')
  final String categoryId;
  @JsonKey(name: 'name_en')
  final String nameEn;
  @JsonKey(name: 'name_ar')
  final String nameAr;
  final String description;
  final num price;
  @JsonKey(includeIfNull: false)
  final String? currency;
  @JsonKey(name: 'discount_type')
  final String? discountType;
  @JsonKey(name: 'discount_value')
  final num? discountValue;
  @JsonKey(name: 'discount_starts_at')
  final DateTime? discountStartsAt;
  @JsonKey(name: 'discount_ends_at')
  final DateTime? discountEndsAt;
  @JsonKey(name: 'on_sale')
  final bool onSale;
  @JsonKey(name: 'discounted_price')
  final num? discountedPrice;
  @JsonKey(name: 'effective_price')
  final num effectivePrice;
  @JsonKey(name: 'discount_percent')
  final int? discountPercent;

  @JsonKey(includeFromJson: false, includeToJson: false)
  num get salePrice => effectivePrice;

  @JsonKey(includeFromJson: false, includeToJson: false)
  num? get compareAtPrice => onSale ? price : null;

  bool get isOnSale => onSale;

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
  final num availableQty;
  @JsonKey(includeFromJson: false, includeToJson: false)
  List<String> get images =>
      orderedMedia.map((image) => image.url).toList(growable: false);
  @JsonKey(name: 'images')
  final List<ProductImage> media;
  List<ProductImage> get orderedMedia =>
      [...media]..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  List<CatalogImage> get displayImages =>
      images.map(UrlCatalogImage.new).toList(growable: false);

  final List<ProductVariant> variants;

  /// The name for the active language, falling back to the other side.
  String localizedName(String languageCode) {
    if (languageCode == 'ar') return nameAr.isNotEmpty ? nameAr : nameEn;
    return nameEn.isNotEmpty ? nameEn : nameAr;
  }

  /// First image, or null when the product has none (the UI shows a placeholder).
  CatalogImage? get primaryDisplayImage => displayImages.firstOrNull;

  /// The URL of the first image in server-defined display order.
  String? get primaryImage => switch (primaryDisplayImage) {
    UrlCatalogImage(:final url) => url,
    _ => null,
  };

  Product copyWith({List<ProductImage>? media}) => Product(
    id: id,
    categoryId: categoryId,
    nameEn: nameEn,
    nameAr: nameAr,
    description: description,
    price: price,
    currency: currency,
    discountType: discountType,
    discountValue: discountValue,
    discountStartsAt: discountStartsAt,
    discountEndsAt: discountEndsAt,
    onSale: onSale,
    discountedPrice: discountedPrice,
    effectivePrice: effectivePrice,
    discountPercent: discountPercent,
    isNegotiable: isNegotiable,
    floorPrice: floorPrice,
    pointsPrice: pointsPrice,
    tracksExpiry: tracksExpiry,
    ratingAvg: ratingAvg,
    status: status,
    inStock: inStock,
    availableQty: availableQty,
    media: media ?? this.media,
    variants: variants,
  );

  factory Product.fromJson(Map<String, dynamic> json) {
    // The original promotion price must also be usable before showing it.
    if (json.containsKey('price') || json['on_sale'] == true) {
      _checkedPrice(json['price']);
    }
    // Product read properties are optional in API 11. For older partial responses,
    // use the server's discounted_price while on sale, otherwise its base price.
    // Never infer a scheduled promotion using the device clock or legacy fields.
    final price = json.containsKey('effective_price')
        ? json['effective_price']
        : json['on_sale'] == true
        ? json['discounted_price']
        : json['on_sale'] == false || json['discount_type'] == null
        ? json['price']
        : null;
    return _$ProductFromJson({
      ...json,
      'effective_price': _checkedPrice(price),
    });
  }

  Map<String, dynamic> toJson() => _$ProductToJson(this);
}

/// Server image identity and display order survive JSON round trips.
@JsonSerializable()
class ProductImage {
  const ProductImage({
    required this.id,
    required this.url,
    required this.sortOrder,
    required this.isPrimary,
  });
  final String id;
  final String url;
  @JsonKey(name: 'sort_order')
  final int sortOrder;
  @JsonKey(name: 'is_primary')
  final bool isPrimary;
  factory ProductImage.fromJson(Map<String, dynamic> json) =>
      _$ProductImageFromJson(json);
  Map<String, dynamic> toJson() => _$ProductImageToJson(this);
}

num _checkedPrice(Object? value) {
  if (value is! num || !value.isFinite || value < 0) {
    throw const AppFailure(FailureKind.server);
  }
  return value;
}
