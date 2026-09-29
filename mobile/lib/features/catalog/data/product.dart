import 'package:json_annotation/json_annotation.dart';

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
    this.currency,
  });

  final String id;
  final String sku;
  final Map<String, dynamic> attributes;
  @JsonKey(name: 'price_delta')
  final num priceDelta;
  @JsonKey(includeIfNull: false)
  final String? currency;

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
    num? salePrice,
    num? compareAtPrice,
    this.isNegotiable = false,
    this.floorPrice,
    this.pointsPrice,
    this.tracksExpiry = false,
    this.ratingAvg = 0,
    this.status = 'active',
    this.inStock = true,
    this.availableQty = 0,
    List<String> images = const [],
    this.media = const [],
    this.mockImages,
    this.variants = const [],
  }) : _fixtureImages = images,
       effectivePrice = effectivePrice ?? salePrice ?? price,
       _legacySalePrice = salePrice,
       _legacyCompareAtPrice = compareAtPrice;

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

  // Keep direct constructors used by the mock layer source-compatible while
  // remote reads use the scheduled-discount contract above.
  final num? _legacySalePrice;
  final num? _legacyCompareAtPrice;

  @JsonKey(includeFromJson: false, includeToJson: false)
  num get salePrice => _legacySalePrice ?? effectivePrice;

  @JsonKey(includeFromJson: false, includeToJson: false)
  num? get compareAtPrice => _legacyCompareAtPrice ?? (onSale ? price : null);

  bool get isOnSale =>
      onSale ||
      (_legacyCompareAtPrice != null &&
          _legacyCompareAtPrice.isFinite &&
          salePrice.isFinite &&
          _legacyCompareAtPrice > 0 &&
          _legacyCompareAtPrice > salePrice);

  /// Contract calculation for mock responses; remote percentages remain read-only.
  static int? discountPercentFor(num sale, num? original) =>
      original != null &&
          original.isFinite &&
          sale.isFinite &&
          original > 0 &&
          original > sale
      ? ((original - sale) / original * 100).round()
      : null;
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
  final List<String> _fixtureImages;
  @JsonKey(includeFromJson: false, includeToJson: false)
  List<String> get images => media.isEmpty
      ? _fixtureImages
      : orderedMedia.map((image) => image.url).toList(growable: false);
  @JsonKey(name: 'images')
  final List<ProductImage> media;
  List<ProductImage> get orderedMedia =>
      [...media]..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  @JsonKey(includeFromJson: false, includeToJson: false)
  final List<CatalogImage>? mockImages;
  List<CatalogImage> get displayImages =>
      mockImages ?? images.map(UrlCatalogImage.new).toList(growable: false);

  /// Legacy prices and URL-only galleries exist only in the in-memory fixtures.
  /// Remote decoding never passes through this conversion.
  factory Product.fromMock(Map<String, dynamic> json) {
    final hasSchedule =
        json['discount_starts_at'] != null || json['discount_ends_at'] != null;
    final sale = hasSchedule
        ? null
        : json['sale_price'] as num? ??
              (json.containsKey('compare_at_price')
                  ? json['effective_price'] as num? ?? json['price'] as num?
                  : null);
    final original = json['compare_at_price'] as num?;
    final discounted = sale != null && original != null && original > sale;
    return Product.fromJson({
      ...json,
      'images': <dynamic>[],
      if (sale != null) ...{
        'price': discounted ? original : sale,
        'discount_type': discounted ? 'amount' : null,
        'discount_value': discounted ? original - sale : null,
        'on_sale': discounted,
        'discounted_price': discounted ? sale : null,
        'effective_price': sale,
      },
    }).copyWith(
      images: [
        for (final image in json['images'] as List? ?? [])
          image is String ? image : (image as Map)['url'] as String,
      ],
      mockImages: (json['mock_images'] as List?)?.cast<CatalogImage>(),
    );
  }
  Map<String, dynamic> toMock() => {
    ...toJson(),
    'sale_price': salePrice,
    'compare_at_price': compareAtPrice,
    'images': images,
    'mock_images': mockImages,
  };
  final List<ProductVariant> variants;

  /// The name for the active language, falling back to the other side.
  String localizedName(String languageCode) {
    if (languageCode == 'ar') return nameAr.isNotEmpty ? nameAr : nameEn;
    return nameEn.isNotEmpty ? nameEn : nameAr;
  }

  /// First image, or null when the product has none (the UI shows a placeholder).
  CatalogImage? get primaryDisplayImage => displayImages.firstOrNull;

  /// URL-only consumers cannot represent session-local bytes. Never return an
  /// unrelated old URL when the current primary image is local.
  String? get primaryImage => switch (primaryDisplayImage) {
    UrlCatalogImage(:final url) => url,
    _ => null,
  };

  Product copyWith({List<String>? images, List<CatalogImage>? mockImages}) =>
      Product(
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
        salePrice: _legacySalePrice,
        compareAtPrice: _legacyCompareAtPrice,
        isNegotiable: isNegotiable,
        floorPrice: floorPrice,
        pointsPrice: pointsPrice,
        tracksExpiry: tracksExpiry,
        ratingAvg: ratingAvg,
        status: status,
        inStock: inStock,
        availableQty: availableQty,
        images: images ?? _fixtureImages,
        media: images == null ? media : const [],
        mockImages: mockImages ?? this.mockImages,
        variants: variants,
      );

  factory Product.fromJson(Map<String, dynamic> json) =>
      _$ProductFromJson(json);

  Map<String, dynamic> toJson() {
    final json = _$ProductToJson(this);
    if (_fixtureImages.isNotEmpty && media.isEmpty) {
      json['images'] = [
        for (final (i, url) in _fixtureImages.indexed)
          {
            'id': 'mock-image-$i',
            'url': url,
            'sort_order': i,
            'is_primary': i == 0,
          },
      ];
    }
    if (_legacySalePrice == null ||
        discountType != null ||
        discountStartsAt != null ||
        discountEndsAt != null) {
      return json;
    }

    final original = _legacyCompareAtPrice;
    final discounted = isOnSale;
    json
      ..['price'] = discounted ? original : salePrice
      ..['discount_type'] = discounted ? 'amount' : null
      ..['discount_value'] = discounted ? original! - salePrice : null
      ..['discount_starts_at'] = null
      ..['discount_ends_at'] = null
      ..['on_sale'] = discounted
      ..['discounted_price'] = discounted ? salePrice : null
      ..['effective_price'] = salePrice
      ..['discount_percent'] = discounted
          ? discountPercent ?? discountPercentFor(salePrice, original)
          : null;
    return json;
  }
}

/// Stable image identity is retained for atomic PATCH media operations.
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
