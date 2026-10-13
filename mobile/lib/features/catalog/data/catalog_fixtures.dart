import 'product.dart';

/// Legacy fixture input is adapted here, never by production JSON decoding.
Product productFromFixture(Map<String, dynamic> json) {
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
    'images': fixtureProductImages([
      for (final image in json['images'] as List? ?? [])
        image is String ? image : (image as Map)['url'] as String,
    ]).map((image) => image.toJson()).toList(),
    'variants': [
      for (final variant in json['variants'] as List? ?? [])
        {
          ...variant as Map<String, dynamic>,
          'effective_price':
              variant['effective_price'] ??
              (sale ?? json['effective_price'] ?? json['price'] ?? 0) +
                  (variant['price_delta'] ?? 0),
        },
    ],
    if (sale != null) ...{
      'price': discounted ? original : sale,
      'discount_type': discounted ? 'amount' : null,
      'discount_value': discounted ? original - sale : null,
      'on_sale': discounted,
      'discounted_price': discounted ? sale : null,
      'effective_price': sale,
    },
  });
}

extension ProductFixture on Product {
  Map<String, dynamic> toFixture() => {
    ...toJson(),
    'sale_price': salePrice,
    'compare_at_price': compareAtPrice,
    'images': images,
  };
}

List<ProductImage> fixtureProductImages(List<String> urls) => [
  for (final (index, url) in urls.indexed)
    ProductImage(
      id: 'fixture-image-$index',
      url: url,
      sortOrder: index,
      isPrimary: index == 0,
    ),
];

int? fixtureDiscountPercent(num sale, num? original) =>
    original != null &&
        original.isFinite &&
        sale.isFinite &&
        original > 0 &&
        original > sale
    ? ((original - sale) / original * 100).round()
    : null;
