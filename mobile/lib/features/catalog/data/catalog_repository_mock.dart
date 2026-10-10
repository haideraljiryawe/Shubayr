import 'catalog_fixtures.dart';
import '../domain/catalog_repository.dart';
import 'category.dart';
import 'product.dart';
import 'product_availability.dart';
import 'product_page.dart';
import 'review.dart';

/// In-memory catalog for explicit test/development overrides.
///
/// Shapes are taken from the `Category` / `Product` / `ProductPage` schemas in
/// `api/openapi.yaml`. Filtering, sorting and pagination
/// mirror API behavior; fixture adaptation stays separate from live models.
class CatalogRepositoryMock implements CatalogRepository {
  CatalogRepositoryMock({this.delay = const Duration(milliseconds: 350)});

  final Duration delay;

  static String _img(String seed) => 'https://picsum.photos/seed/$seed/500/500';

  /// A few distinct images for a product's detail gallery.
  static List<String> _gallery(String id) => [
    for (var i = 1; i <= 4; i++) _img('$id-$i'),
  ];

  /// Unit price for a product/variant — the mock cart prices its lines with
  /// this, mirroring the server computing `unit_price` when an item is added.
  /// Synchronous access to the current mock record when capturing a purchase.
  static Product? productSnapshot(String id) =>
      _products.where((product) => product.id == id).firstOrNull;

  static num unitPrice(String productId, String? variantId) {
    final p = _products.firstWhere((p) => p.id == productId);
    if (variantId == null) return p.salePrice;
    final v = p.variants.firstWhere(
      (v) => v.id == variantId,
      orElse: () => const ProductVariant(id: ''),
    );
    return v.id.isEmpty ? p.effectivePrice : v.effectivePrice;
  }

  static const _cElectronics = 'cat-electronics';
  static const _cGrocery = 'cat-grocery';
  static const _cClothing = 'cat-clothing';
  static const _cHome = 'cat-home';

  static final List<Category> _categories = [
    Category(
      id: _cElectronics,
      nameEn: 'Electronics',
      shortDescriptionEn: 'Devices and accessories',
      shortDescriptionAr: 'أجهزة وملحقات',
      nameAr: 'إلكترونيات',
      iconKey: 'electronics_devices',
      sortOrder: 1,
      children: const [
        Category(
          id: 'cat-phones',
          parentId: _cElectronics,
          nameEn: 'Phones',
          nameAr: 'هواتف',
          iconKey: 'mobile_phone',
          sortOrder: 1,
        ),
        Category(
          id: 'cat-audio',
          parentId: _cElectronics,
          nameEn: 'Audio',
          nameAr: 'صوتيات',
          iconKey: 'audio_headphones',
          sortOrder: 2,
        ),
        Category(
          id: 'cat-wearables',
          parentId: _cElectronics,
          nameEn: 'Wearables',
          nameAr: 'أجهزة الارتداء',
          iconKey: 'accessories_watch',
          sortOrder: 3,
        ),
        Category(
          id: 'cat-accessories',
          parentId: _cElectronics,
          nameEn: 'Accessories',
          nameAr: 'ملحقات',
          iconKey: 'electronics_cable',
          sortOrder: 4,
        ),
      ],
    ),
    Category(
      id: _cGrocery,
      nameEn: 'Grocery',
      shortDescriptionEn: 'Food and everyday essentials',
      shortDescriptionAr: 'غذاء واحتياجات يومية',
      nameAr: 'بقالة',
      iconKey: 'grocery_food',
      sortOrder: 2,
      children: const [
        Category(
          id: 'cat-pantry',
          parentId: _cGrocery,
          nameEn: 'Pantry',
          nameAr: 'مؤن',
          iconKey: 'kitchen_appliances',
          sortOrder: 1,
        ),
        Category(
          id: 'cat-beverages',
          parentId: _cGrocery,
          nameEn: 'Beverages',
          nameAr: 'مشروبات',
          iconKey: 'drinks_coffee',
          sortOrder: 2,
        ),
        Category(
          id: 'cat-staples',
          parentId: _cGrocery,
          nameEn: 'Staples',
          nameAr: 'أساسيات',
          iconKey: 'food_rice',
          sortOrder: 3,
        ),
      ],
    ),
    Category(
      id: _cClothing,
      nameEn: 'Clothing',
      shortDescriptionEn: 'Clothing for the whole family',
      shortDescriptionAr: 'أزياء لكل العائلة',
      nameAr: 'ملابس',
      iconKey: 'fashion_clothing',
      sortOrder: 3,
      children: const [
        Category(
          id: 'cat-men',
          parentId: _cClothing,
          nameEn: 'Men',
          nameAr: 'رجالي',
          iconKey: 'fashion_men',
          sortOrder: 1,
        ),
        Category(
          id: 'cat-women',
          parentId: _cClothing,
          nameEn: 'Women',
          nameAr: 'نسائي',
          iconKey: 'fashion_women',
          sortOrder: 2,
        ),
        Category(
          id: 'cat-kids',
          parentId: _cClothing,
          nameEn: 'Kids',
          nameAr: 'أطفال',
          iconKey: 'kids_baby',
          sortOrder: 3,
        ),
      ],
    ),
    Category(
      id: _cHome,
      nameEn: 'Home & Kitchen',
      shortDescriptionEn: 'Kitchen and home essentials',
      shortDescriptionAr: 'مستلزمات المنزل والمطبخ',
      nameAr: 'المنزل والمطبخ',
      iconKey: 'home_furniture',
      sortOrder: 4,
      children: const [
        Category(
          id: 'cat-cookware',
          parentId: _cHome,
          nameEn: 'Cookware',
          nameAr: 'أواني طهي',
          iconKey: 'kitchen_cooking',
          sortOrder: 1,
        ),
        Category(
          id: 'cat-tableware',
          parentId: _cHome,
          nameEn: 'Tableware',
          nameAr: 'أدوات المائدة',
          iconKey: 'kitchen_tableware',
          sortOrder: 2,
        ),
        Category(
          id: 'cat-lighting',
          parentId: _cHome,
          nameEn: 'Lighting',
          nameAr: 'إضاءة',
          iconKey: 'home_lighting',
          sortOrder: 3,
        ),
      ],
    ),
    Category(
      id: 'cat-beauty',
      nameEn: 'Beauty & Personal Care',
      shortDescriptionEn: 'Skin, hair and personal care',
      shortDescriptionAr: 'عناية بالبشرة والشعر',
      nameAr: 'الجمال والعناية',
      iconKey: 'beauty_spa',
      sortOrder: 5,
      children: const [
        Category(
          id: 'cat-skincare',
          parentId: 'cat-beauty',
          nameEn: 'Skin Care',
          nameAr: 'العناية بالبشرة',
          iconKey: 'beauty_skin',
          sortOrder: 1,
        ),
        Category(
          id: 'cat-haircare',
          parentId: 'cat-beauty',
          nameEn: 'Hair Care',
          nameAr: 'العناية بالشعر',
          iconKey: 'beauty_hair',
          sortOrder: 2,
        ),
        Category(
          id: 'cat-fragrance',
          parentId: 'cat-beauty',
          nameEn: 'Fragrances',
          nameAr: 'العطور',
          iconKey: 'beauty_fragrance',
          sortOrder: 3,
        ),
      ],
    ),
    Category(
      id: 'cat-sports',
      nameEn: 'Sports & Outdoors',
      shortDescriptionEn: 'Fitness and outdoor gear',
      shortDescriptionAr: 'لياقة ولوازم رحلات',
      nameAr: 'الرياضة والرحلات',
      iconKey: 'sport_fitness',
      sortOrder: 6,
      children: const [
        Category(
          id: 'cat-fitness',
          parentId: 'cat-sports',
          nameEn: 'Fitness',
          nameAr: 'اللياقة البدنية',
          iconKey: 'sport_fitness',
          sortOrder: 1,
        ),
        Category(
          id: 'cat-outdoors',
          parentId: 'cat-sports',
          nameEn: 'Camping & Outdoors',
          nameAr: 'التخييم والرحلات',
          iconKey: 'garden_trees',
          sortOrder: 2,
        ),
        Category(
          id: 'cat-cycling',
          parentId: 'cat-sports',
          nameEn: 'Cycling',
          nameAr: 'ركوب الدراجات',
          iconKey: 'sport_cycling',
          sortOrder: 3,
        ),
      ],
    ),
  ];

  /// A category id plus all of its descendants — a `GET /products?category_id=`
  /// on a department returns everything under it, while a leaf returns just its
  /// own products. Mirrors how the real backend scopes a category filter.
  static Set<String> _categorySubtree(String id) {
    Set<String>? visit(Category node) {
      if (node.id == id) {
        Set<String> descendants(Category c) => {
          c.id,
          for (final child in c.children) ...descendants(child),
        };
        return descendants(node);
      }
      for (final child in node.children) {
        final found = visit(child);
        if (found != null) return found;
      }
      return null;
    }

    for (final root in _categories) {
      final found = visit(root);
      if (found != null) return found;
    }
    return {id};
  }

  static final _replacedProducts = <String>{};

  /// Replace catalog fixtures for tests that simulate server-side edits.
  void replaceFixtures({
    required List<Map<String, dynamic>> products,
    required List<Map<String, dynamic>> categories,
  }) {
    for (final value in products) {
      final old = _products.where((p) => p.id == value['id']).firstOrNull;
      if (old == null || old.toFixture().toString() != value.toString()) {
        _replacedProducts.add(value['id'] as String);
      }
    }
    _products
      ..clear()
      ..addAll(products.map(productFromFixture).map(_withDiscount));
    final ordered = [...categories]
      ..sort((a, b) {
        final order = ((a['sort_order'] as num?) ?? 0).compareTo(
          (b['sort_order'] as num?) ?? 0,
        );
        return order != 0
            ? order
            : (a['id'] as String).compareTo(b['id'] as String);
      });
    Category node(Map<String, dynamic> value) => Category.fromJson({
      ...value,
      'children': [
        for (final child in ordered)
          if (child['parent_id'] == value['id']) node(child).toJson(),
      ],
    });
    _categories
      ..clear()
      ..addAll([
        for (final value in ordered)
          if (value['parent_id'] == null) node(value),
      ]);
  }

  static final List<Product> _products = [
    Product(
      id: 'p1',
      categoryId: 'cat-audio',
      nameEn: 'Wireless Earbuds',
      nameAr: 'سماعات لاسلكية',
      description: 'Compact wireless earbuds with a charging case.',
      effectivePrice: 45000,
      price: 60000,
      onSale: true,
      ratingAvg: 4.5,
      availableQty: 30,
      media: fixtureProductImages([_img('p1')]),
    ),
    Product(
      id: 'p2',
      categoryId: 'cat-wearables',
      nameEn: 'Smart Watch',
      nameAr: 'ساعة ذكية',
      description: 'Fitness tracking, notifications and a week of battery.',
      effectivePrice: 120000,
      price: 150000,
      onSale: true,
      isNegotiable: true,
      floorPrice: 100000,
      ratingAvg: 4.2,
      availableQty: 12,
      media: fixtureProductImages([_img('p2')]),
    ),
    Product(
      id: 'p3',
      categoryId: 'cat-accessories',
      nameEn: 'Power Bank 20000mAh',
      nameAr: 'باور بانك ٢٠٠٠٠',
      description: 'Fast-charging power bank with two USB outputs.',
      effectivePrice: 32000,
      price: 40000,
      onSale: true,
      pointsPrice: 320,
      ratingAvg: 4.0,
      availableQty: 0,
      inStock: false,
      media: fixtureProductImages([_img('p3')]),
    ),
    Product(
      id: 'p4',
      categoryId: 'cat-pantry',
      nameEn: 'Olive Oil 1L',
      nameAr: 'زيت زيتون ١ لتر',
      description: 'Extra-virgin olive oil, cold pressed.',
      effectivePrice: 15000,
      price: 20000,
      onSale: true,
      ratingAvg: 4.8,
      availableQty: 80,
      media: fixtureProductImages([_img('p4')]),
    ),
    Product(
      id: 'p5',
      categoryId: 'cat-staples',
      nameEn: 'Basmati Rice 5kg',
      nameAr: 'رز بسمتي ٥ كغم',
      description: 'Aged long-grain basmati rice.',
      effectivePrice: 22000,
      price: 25000,
      onSale: true,
      ratingAvg: 4.6,
      availableQty: 50,
      media: fixtureProductImages([_img('p5')]),
    ),
    Product(
      id: 'p6',
      categoryId: 'cat-beverages',
      nameEn: 'Ground Coffee 250g',
      nameAr: 'قهوة مطحونة ٢٥٠ غم',
      description: 'Medium-roast Arabica ground coffee.',
      effectivePrice: 9000,
      price: 10000,
      onSale: true,
      ratingAvg: 4.3,
      availableQty: 40,
      media: fixtureProductImages([_img('p6')]),
    ),
    Product(
      id: 'p7',
      categoryId: 'cat-men',
      nameEn: 'Cotton T-Shirt',
      nameAr: 'قميص قطني',
      description: 'Soft cotton t-shirt, several sizes.',
      effectivePrice: 12000,
      price: 15000,
      onSale: true,
      ratingAvg: 4.1,
      availableQty: 60,
      media: fixtureProductImages([_img('p7')]),
      variants: const [
        ProductVariant(
          effectivePrice: 12000,
          id: 'p7-s',
          sku: 'TS-S',
          attributes: {'size': 'S'},
        ),
        ProductVariant(
          effectivePrice: 12000,
          id: 'p7-m',
          sku: 'TS-M',
          attributes: {'size': 'M'},
        ),
        ProductVariant(
          id: 'p7-l',
          sku: 'TS-L',
          attributes: {'size': 'L'},
          priceDelta: 1000,
          effectivePrice: 13000,
        ),
      ],
    ),
    Product(
      id: 'p8',
      categoryId: 'cat-men',
      nameEn: 'Denim Jacket',
      nameAr: 'جاكيت جينز',
      description: 'Classic denim jacket.',
      effectivePrice: 38000,
      price: 45000,
      onSale: true,
      isNegotiable: true,
      floorPrice: 30000,
      ratingAvg: 4.4,
      availableQty: 15,
      media: fixtureProductImages([_img('p8')]),
    ),
    Product(
      id: 'p9',
      categoryId: 'cat-cookware',
      nameEn: 'Non-stick Pan',
      nameAr: 'مقلاة غير لاصقة',
      description: '28cm non-stick frying pan.',
      effectivePrice: 18000,
      price: 20000,
      onSale: true,
      ratingAvg: 4.5,
      availableQty: 25,
      media: fixtureProductImages([_img('p9')]),
    ),
    Product(
      id: 'p10',
      categoryId: 'cat-tableware',
      nameEn: 'Ceramic Mug Set',
      nameAr: 'طقم أكواب سيراميك',
      description: 'Set of four ceramic mugs.',
      effectivePrice: 14000,
      ratingAvg: 4.7,
      availableQty: 35,
      media: fixtureProductImages([_img('p10')]),
    ),
    Product(
      id: 'p11',
      categoryId: 'cat-lighting',
      nameEn: 'LED Desk Lamp',
      nameAr: 'مصباح مكتب LED',
      description: 'Dimmable LED desk lamp with USB port.',
      effectivePrice: 26000,
      pointsPrice: 260,
      ratingAvg: 4.2,
      availableQty: 20,
      media: fixtureProductImages([_img('p11')]),
    ),
    Product(
      id: 'p12',
      categoryId: 'cat-audio',
      nameEn: 'Bluetooth Speaker',
      nameAr: 'مكبر صوت بلوتوث',
      description: 'Portable waterproof Bluetooth speaker.',
      effectivePrice: 55000,
      ratingAvg: 4.6,
      availableQty: 18,
      media: fixtureProductImages([_img('p12')]),
    ),
    Product(
      id: 'p13',
      categoryId: 'cat-skincare',
      nameEn: 'Gentle Facial Cleanser',
      nameAr: 'غسول لطيف للوجه',
      effectivePrice: 12000,
      price: 16000,
      onSale: true,
      ratingAvg: 4.5,
      availableQty: 30,
      media: fixtureProductImages([_img('p13')]),
    ),
    Product(
      id: 'p14',
      categoryId: 'cat-skincare',
      nameEn: 'Daily Moisturizing Cream',
      nameAr: 'كريم ترطيب يومي',
      effectivePrice: 18000,
      ratingAvg: 4.4,
      availableQty: 25,
      media: fixtureProductImages([_img('p14')]),
    ),
    Product(
      id: 'p15',
      categoryId: 'cat-haircare',
      nameEn: 'Nourishing Shampoo',
      nameAr: 'شامبو مغذٍ للشعر',
      effectivePrice: 9000,
      price: 12000,
      onSale: true,
      ratingAvg: 4.3,
      availableQty: 40,
      media: fixtureProductImages([_img('p15')]),
    ),
    Product(
      id: 'p16',
      categoryId: 'cat-fragrance',
      nameEn: 'Fresh Eau de Parfum',
      nameAr: 'عطر منعش',
      effectivePrice: 35000,
      ratingAvg: 4.6,
      availableQty: 18,
      media: fixtureProductImages([_img('p16')]),
    ),
    Product(
      id: 'p17',
      categoryId: 'cat-fitness',
      nameEn: 'Yoga Exercise Mat',
      nameAr: 'حصيرة تمارين يوغا',
      effectivePrice: 18000,
      price: 24000,
      onSale: true,
      ratingAvg: 4.7,
      availableQty: 20,
      media: fixtureProductImages([_img('p17')]),
    ),
    Product(
      id: 'p18',
      categoryId: 'cat-fitness',
      nameEn: 'Sports Water Bottle',
      nameAr: 'قارورة مياه رياضية',
      effectivePrice: 8000,
      ratingAvg: 4.2,
      availableQty: 45,
      media: fixtureProductImages([_img('p18')]),
    ),
    Product(
      id: 'p19',
      categoryId: 'cat-outdoors',
      nameEn: 'Rechargeable Camping Lantern',
      nameAr: 'فانوس تخييم قابل للشحن',
      effectivePrice: 22000,
      price: 28000,
      onSale: true,
      ratingAvg: 4.5,
      availableQty: 16,
      media: fixtureProductImages([_img('p19')]),
    ),
    Product(
      id: 'p20',
      categoryId: 'cat-cycling',
      nameEn: 'Adjustable Cycling Helmet',
      nameAr: 'خوذة دراجة قابلة للتعديل',
      effectivePrice: 30000,
      price: 40000,
      onSale: true,
      ratingAvg: 4.8,
      availableQty: 14,
      media: fixtureProductImages([_img('p20')]),
    ),
  ].map(_withDiscount).toList();

  static Product _withDiscount(Product p) => Product.fromJson({
    ...p.toJson(),
    'price': p.onSale ? p.price : p.effectivePrice,
    'discount_type': p.discountType ?? (p.onSale ? 'amount' : null),
    'discount_value':
        p.discountValue ?? (p.onSale ? p.price - p.effectivePrice : null),
    'discounted_price': p.onSale ? p.effectivePrice : null,
    'discount_percent': fixtureDiscountPercent(p.salePrice, p.compareAtPrice),
  });

  @override
  Future<List<Category>> fetchCategories() async {
    await Future<void>.delayed(delay);
    Category? visible(Category category) => !category.isActive
        ? null
        : category.copyWith(
            children: [
              for (final child in category.children)
                if (visible(child) case final Category shown) shown,
            ],
          );

    return [
      for (final category in _categories)
        if (visible(category) case final Category shown) shown,
    ];
  }

  @override
  Future<ProductPage> fetchProducts({
    String? query,
    String? categoryId,
    num? minPrice,
    num? maxPrice,
    bool onSale = false,
    String? sort,
    int page = 1,
    int perPage = 20,
  }) async {
    await Future<void>.delayed(delay);

    // A department filter matches the whole subtree; a leaf matches just itself.
    final categoryIds = categoryId == null
        ? null
        : _categorySubtree(categoryId);

    var items = _products.where((p) {
      if (p.status != 'active') return false;
      if (onSale && !p.isOnSale) return false;
      if (categoryIds != null && !categoryIds.contains(p.categoryId)) {
        return false;
      }
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
    final product = _products.firstWhere((p) => p.id == id);
    // List fixtures carry one image; the detail view shows a small gallery.
    return _replacedProducts.contains(id)
        ? product
        : product.copyWith(media: fixtureProductImages(_gallery(id)));
  }

  @override
  Future<ProductAvailability> fetchAvailability(String id) async {
    await Future<void>.delayed(delay);
    final p = _products.firstWhere((p) => p.id == id);
    if (p.variants.isEmpty) {
      return ProductAvailability(
        productId: id,
        inStock: p.inStock,
        availableQty: p.availableQty,
        variants: const [],
      );
    }
    // Mock per-variant stock: first runs low, second is sold out, third is in
    // stock — so the detail screen exercises the low / out / in-stock states
    // (and on p7 the in-stock one carries a price delta, showing the price move).
    const qtys = [4, 0, 25];
    var total = 0;
    final variants = <VariantAvailability>[];
    for (var i = 0; i < p.variants.length; i++) {
      final v = p.variants[i];
      final qty = qtys[i % qtys.length];
      total += qty;
      variants.add(
        VariantAvailability(
          variantId: v.id,
          sku: v.sku,
          availableQty: qty,
          inStock: qty > 0,
        ),
      );
    }
    return ProductAvailability(
      productId: id,
      inStock: total > 0,
      availableQty: total,
      variants: variants,
    );
  }

  // Sample review bodies: (comment, rating, verifiedPurchase).
  static const _reviewPool = <(String, int, bool)>[
    ('ممتاز وجودته عالية، أنصح به بشدة.', 5, true),
    ('جيّد جدًا لكن التوصيل تأخّر يومًا.', 4, true),
    ('مقبول مقابل السعر.', 3, false),
    ('المنتج مطابق للوصف تمامًا، شكرًا.', 5, true),
    ('لم يعجبني كثيرًا، الجودة أقل من المتوقّع.', 2, true),
  ];

  /// Deterministic reviews per product — a couple of products land on zero so
  /// the empty state shows too.
  List<Review> _reviewsFor(String id) {
    final count = id.codeUnits.fold<int>(0, (a, b) => a + b) % 6;
    final now = DateTime.now();
    return [
      for (var i = 0; i < count; i++)
        Review(
          id: '$id-r$i',
          productId: id,
          userId: 'user-$i',
          rating: _reviewPool[i % _reviewPool.length].$2,
          comment: _reviewPool[i % _reviewPool.length].$1,
          verifiedPurchase: _reviewPool[i % _reviewPool.length].$3,
          createdAt: now.subtract(Duration(days: i * 5 + 2)),
        ),
    ];
  }

  @override
  Future<ReviewPage> fetchReviews(
    String id, {
    int page = 1,
    int perPage = 20,
  }) async {
    await Future<void>.delayed(delay);
    final all = _reviewsFor(id);
    final start = (page - 1) * perPage;
    final data = start >= all.length
        ? <Review>[]
        : all.sublist(start, (start + perPage).clamp(0, all.length));
    return ReviewPage(
      page: page,
      perPage: perPage,
      total: all.length,
      data: data,
    );
  }
}
