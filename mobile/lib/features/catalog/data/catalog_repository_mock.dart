import '../domain/catalog_repository.dart';
import 'category.dart';
import 'product.dart';
import 'product_page.dart';

/// In-memory catalog for development before the backend is live.
///
/// Shapes are taken from the `Category` / `Product` / `ProductPage` schemas in
/// `api/openapi.yaml`; no field is invented. Filtering, sorting and pagination
/// are implemented here so the UI behaves the same as it will against the API.
class CatalogRepositoryMock implements CatalogRepository {
  CatalogRepositoryMock({this.delay = const Duration(milliseconds: 350)});

  final Duration delay;

  static String _img(String seed) => 'https://picsum.photos/seed/$seed/500/500';

  static const _cElectronics = 'cat-electronics';
  static const _cGrocery = 'cat-grocery';
  static const _cClothing = 'cat-clothing';
  static const _cHome = 'cat-home';

  static final List<Category> _categories = [
    Category(
      id: _cElectronics,
      nameEn: 'Electronics',
      nameAr: 'إلكترونيات',
      icon: 'devices',
      sortOrder: 1,
      children: const [
        Category(
          id: 'cat-phones',
          parentId: _cElectronics,
          nameEn: 'Phones',
          nameAr: 'هواتف',
          sortOrder: 1,
        ),
        Category(
          id: 'cat-accessories',
          parentId: _cElectronics,
          nameEn: 'Accessories',
          nameAr: 'ملحقات',
          sortOrder: 2,
        ),
      ],
    ),
    Category(
      id: _cGrocery,
      nameEn: 'Grocery',
      nameAr: 'بقالة',
      icon: 'basket',
      sortOrder: 2,
    ),
    Category(
      id: _cClothing,
      nameEn: 'Clothing',
      nameAr: 'ملابس',
      icon: 'checkroom',
      sortOrder: 3,
    ),
    Category(
      id: _cHome,
      nameEn: 'Home & Kitchen',
      nameAr: 'المنزل والمطبخ',
      icon: 'home',
      sortOrder: 4,
    ),
  ];

  static final List<Product> _products = [
    Product(
      id: 'p1',
      categoryId: _cElectronics,
      nameEn: 'Wireless Earbuds',
      nameAr: 'سماعات لاسلكية',
      description: 'Compact wireless earbuds with a charging case.',
      salePrice: 45000,
      ratingAvg: 4.5,
      availableQty: 30,
      images: [_img('p1')],
    ),
    Product(
      id: 'p2',
      categoryId: _cElectronics,
      nameEn: 'Smart Watch',
      nameAr: 'ساعة ذكية',
      description: 'Fitness tracking, notifications and a week of battery.',
      salePrice: 120000,
      isNegotiable: true,
      floorPrice: 100000,
      ratingAvg: 4.2,
      availableQty: 12,
      images: [_img('p2')],
    ),
    Product(
      id: 'p3',
      categoryId: _cElectronics,
      nameEn: 'Power Bank 20000mAh',
      nameAr: 'باور بانك ٢٠٠٠٠',
      description: 'Fast-charging power bank with two USB outputs.',
      salePrice: 32000,
      pointsPrice: 320,
      ratingAvg: 4.0,
      availableQty: 0,
      inStock: false,
      images: [_img('p3')],
    ),
    Product(
      id: 'p4',
      categoryId: _cGrocery,
      nameEn: 'Olive Oil 1L',
      nameAr: 'زيت زيتون ١ لتر',
      description: 'Extra-virgin olive oil, cold pressed.',
      salePrice: 15000,
      ratingAvg: 4.8,
      availableQty: 80,
      images: [_img('p4')],
    ),
    Product(
      id: 'p5',
      categoryId: _cGrocery,
      nameEn: 'Basmati Rice 5kg',
      nameAr: 'رز بسمتي ٥ كغم',
      description: 'Aged long-grain basmati rice.',
      salePrice: 22000,
      ratingAvg: 4.6,
      availableQty: 50,
      images: [_img('p5')],
    ),
    Product(
      id: 'p6',
      categoryId: _cGrocery,
      nameEn: 'Ground Coffee 250g',
      nameAr: 'قهوة مطحونة ٢٥٠ غم',
      description: 'Medium-roast Arabica ground coffee.',
      salePrice: 9000,
      ratingAvg: 4.3,
      availableQty: 40,
      images: [_img('p6')],
    ),
    Product(
      id: 'p7',
      categoryId: _cClothing,
      nameEn: 'Cotton T-Shirt',
      nameAr: 'قميص قطني',
      description: 'Soft cotton t-shirt, several sizes.',
      salePrice: 12000,
      ratingAvg: 4.1,
      availableQty: 60,
      images: [_img('p7')],
      variants: const [
        ProductVariant(id: 'p7-s', sku: 'TS-S', attributes: {'size': 'S'}),
        ProductVariant(id: 'p7-m', sku: 'TS-M', attributes: {'size': 'M'}),
        ProductVariant(
          id: 'p7-l',
          sku: 'TS-L',
          attributes: {'size': 'L'},
          priceDelta: 1000,
        ),
      ],
    ),
    Product(
      id: 'p8',
      categoryId: _cClothing,
      nameEn: 'Denim Jacket',
      nameAr: 'جاكيت جينز',
      description: 'Classic denim jacket.',
      salePrice: 38000,
      isNegotiable: true,
      floorPrice: 30000,
      ratingAvg: 4.4,
      availableQty: 15,
      images: [_img('p8')],
    ),
    Product(
      id: 'p9',
      categoryId: _cHome,
      nameEn: 'Non-stick Pan',
      nameAr: 'مقلاة غير لاصقة',
      description: '28cm non-stick frying pan.',
      salePrice: 18000,
      ratingAvg: 4.5,
      availableQty: 25,
      images: [_img('p9')],
    ),
    Product(
      id: 'p10',
      categoryId: _cHome,
      nameEn: 'Ceramic Mug Set',
      nameAr: 'طقم أكواب سيراميك',
      description: 'Set of four ceramic mugs.',
      salePrice: 14000,
      ratingAvg: 4.7,
      availableQty: 35,
      images: [_img('p10')],
    ),
    Product(
      id: 'p11',
      categoryId: _cHome,
      nameEn: 'LED Desk Lamp',
      nameAr: 'مصباح مكتب LED',
      description: 'Dimmable LED desk lamp with USB port.',
      salePrice: 26000,
      pointsPrice: 260,
      ratingAvg: 4.2,
      availableQty: 20,
      images: [_img('p11')],
    ),
    Product(
      id: 'p12',
      categoryId: _cElectronics,
      nameEn: 'Bluetooth Speaker',
      nameAr: 'مكبر صوت بلوتوث',
      description: 'Portable waterproof Bluetooth speaker.',
      salePrice: 55000,
      ratingAvg: 4.6,
      availableQty: 18,
      images: [_img('p12')],
    ),
  ];

  @override
  Future<List<Category>> fetchCategories() async {
    await Future<void>.delayed(delay);
    return _categories;
  }

  @override
  Future<ProductPage> fetchProducts({
    String? query,
    String? categoryId,
    num? minPrice,
    num? maxPrice,
    String? sort,
    int page = 1,
    int perPage = 20,
  }) async {
    await Future<void>.delayed(delay);

    var items = _products.where((p) {
      if (categoryId != null && p.categoryId != categoryId) return false;
      if (minPrice != null && p.salePrice < minPrice) return false;
      if (maxPrice != null && p.salePrice > maxPrice) return false;
      if (query != null && query.trim().isNotEmpty) {
        final q = query.trim().toLowerCase();
        if (!p.nameEn.toLowerCase().contains(q) && !p.nameAr.contains(q)) {
          return false;
        }
      }
      return true;
    }).toList();

    items = switch (sort) {
      'price_asc' => items..sort((a, b) => a.salePrice.compareTo(b.salePrice)),
      'price_desc' => items..sort((a, b) => b.salePrice.compareTo(a.salePrice)),
      'rating' => items..sort((a, b) => b.ratingAvg.compareTo(a.ratingAvg)),
      _ => items, // 'newest' / null: keep insertion order
    };

    final total = items.length;
    final start = (page - 1) * perPage;
    final pageItems = start >= total
        ? <Product>[]
        : items.sublist(start, (start + perPage).clamp(0, total));

    return ProductPage(
      page: page,
      perPage: perPage,
      total: total,
      data: pageItems,
    );
  }

  @override
  Future<Product> fetchProduct(String id) async {
    await Future<void>.delayed(delay);
    return _products.firstWhere((p) => p.id == id);
  }
}
