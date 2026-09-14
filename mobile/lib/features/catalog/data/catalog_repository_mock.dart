import '../domain/catalog_repository.dart';
import 'category.dart';
import 'product.dart';
import 'product_availability.dart';
import 'product_page.dart';
import 'review.dart';

/// In-memory catalog for development before the backend is live.
///
/// Shapes are taken from the `Category` / `Product` / `ProductPage` schemas in
/// `api/openapi.yaml`; no field is invented. Filtering, sorting and pagination
/// are implemented here so the UI behaves the same as it will against the API.
class CatalogRepositoryMock implements CatalogRepository {
  CatalogRepositoryMock({this.delay = const Duration(milliseconds: 350)});

  final Duration delay;

  /// Management reads include hidden parents and descendants.
  List<Category> get adminCategories => List.unmodifiable(_categories);

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
    return p.salePrice + v.priceDelta;
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
      icon: 'devices',
      iconKey: 'electronics_devices',
      sortOrder: 1,
      children: const [
        Category(
          id: 'cat-phones',
          parentId: _cElectronics,
          nameEn: 'Phones',
          nameAr: 'هواتف',
          icon: 'smartphone',
          iconKey: 'mobile_phone',
          sortOrder: 1,
        ),
        Category(
          id: 'cat-audio',
          parentId: _cElectronics,
          nameEn: 'Audio',
          nameAr: 'صوتيات',
          icon: 'headphones',
          iconKey: 'audio_headphones',
          sortOrder: 2,
        ),
        Category(
          id: 'cat-wearables',
          parentId: _cElectronics,
          nameEn: 'Wearables',
          nameAr: 'أجهزة الارتداء',
          icon: 'watch',
          iconKey: 'accessories_watch',
          sortOrder: 3,
        ),
        Category(
          id: 'cat-accessories',
          parentId: _cElectronics,
          nameEn: 'Accessories',
          nameAr: 'ملحقات',
          icon: 'cable',
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
      icon: 'basket',
      iconKey: 'grocery_food',
      sortOrder: 2,
      children: const [
        Category(
          id: 'cat-pantry',
          parentId: _cGrocery,
          nameEn: 'Pantry',
          nameAr: 'مؤن',
          icon: 'kitchen',
          iconKey: 'kitchen_appliances',
          sortOrder: 1,
        ),
        Category(
          id: 'cat-beverages',
          parentId: _cGrocery,
          nameEn: 'Beverages',
          nameAr: 'مشروبات',
          icon: 'coffee',
          iconKey: 'drinks_coffee',
          sortOrder: 2,
        ),
        Category(
          id: 'cat-staples',
          parentId: _cGrocery,
          nameEn: 'Staples',
          nameAr: 'أساسيات',
          icon: 'rice',
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
      icon: 'checkroom',
      iconKey: 'fashion_clothing',
      sortOrder: 3,
      children: const [
        Category(
          id: 'cat-men',
          parentId: _cClothing,
          nameEn: 'Men',
          nameAr: 'رجالي',
          icon: 'man',
          iconKey: 'fashion_men',
          sortOrder: 1,
        ),
        Category(
          id: 'cat-women',
          parentId: _cClothing,
          nameEn: 'Women',
          nameAr: 'نسائي',
          icon: 'woman',
          iconKey: 'fashion_women',
          sortOrder: 2,
        ),
        Category(
          id: 'cat-kids',
          parentId: _cClothing,
          nameEn: 'Kids',
          nameAr: 'أطفال',
          icon: 'child',
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
      icon: 'home',
      iconKey: 'home_furniture',
      sortOrder: 4,
      children: const [
        Category(
          id: 'cat-cookware',
          parentId: _cHome,
          nameEn: 'Cookware',
          nameAr: 'أواني طهي',
          icon: 'cookware',
          iconKey: 'kitchen_cooking',
          sortOrder: 1,
        ),
        Category(
          id: 'cat-tableware',
          parentId: _cHome,
          nameEn: 'Tableware',
          nameAr: 'أدوات المائدة',
          icon: 'tableware',
          iconKey: 'kitchen_tableware',
          sortOrder: 2,
        ),
        Category(
          id: 'cat-lighting',
          parentId: _cHome,
          nameEn: 'Lighting',
          nameAr: 'إضاءة',
          icon: 'lighting',
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
      icon: 'spa',
      iconKey: 'beauty_spa',
      sortOrder: 5,
      children: const [
        Category(
          id: 'cat-skincare',
          parentId: 'cat-beauty',
          nameEn: 'Skin Care',
          nameAr: 'العناية بالبشرة',
          icon: 'face',
          iconKey: 'beauty_skin',
          sortOrder: 1,
        ),
        Category(
          id: 'cat-haircare',
          parentId: 'cat-beauty',
          nameEn: 'Hair Care',
          nameAr: 'العناية بالشعر',
          icon: 'haircare',
          iconKey: 'beauty_hair',
          sortOrder: 2,
        ),
        Category(
          id: 'cat-fragrance',
          parentId: 'cat-beauty',
          nameEn: 'Fragrances',
          nameAr: 'العطور',
          icon: 'fragrance',
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
      icon: 'fitness',
      iconKey: 'sport_fitness',
      sortOrder: 6,
      children: const [
        Category(
          id: 'cat-fitness',
          parentId: 'cat-sports',
          nameEn: 'Fitness',
          nameAr: 'اللياقة البدنية',
          icon: 'fitness',
          iconKey: 'sport_fitness',
          sortOrder: 1,
        ),
        Category(
          id: 'cat-outdoors',
          parentId: 'cat-sports',
          nameEn: 'Camping & Outdoors',
          nameAr: 'التخييم والرحلات',
          icon: 'outdoors',
          iconKey: 'garden_trees',
          sortOrder: 2,
        ),
        Category(
          id: 'cat-cycling',
          parentId: 'cat-sports',
          nameEn: 'Cycling',
          nameAr: 'ركوب الدراجات',
          icon: 'cycling',
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

  static final _adminEditedProducts = <String>{};

  /// The admin mock and customer mock share catalog data during this app run.
  /// Writes contain the already validated admin snapshot; stock is preserved.
  void applyAdminCatalog({
    required List<Map<String, dynamic>> products,
    required List<Map<String, dynamic>> categories,
  }) {
    for (final value in products) {
      final old = _products.where((p) => p.id == value['id']).firstOrNull;
      if (old == null || old.toMock().toString() != value.toString()) {
        _adminEditedProducts.add(value['id'] as String);
      }
    }
    _products
      ..clear()
      ..addAll(products.map(Product.fromMock).map(_withDiscount));
    final ordered = [...categories]
      ..sort((a, b) {
        final order = ((a['sort_order'] as num?) ?? 0).compareTo(
          (b['sort_order'] as num?) ?? 0,
        );
        return order != 0
            ? order
            : (a['id'] as String).compareTo(b['id'] as String);
      });
    Category node(Map<String, dynamic> value) => Category.fromMock({
      ...value,
      'children': [
        for (final child in ordered)
          if (child['parent_id'] == value['id']) node(child).toMock(),
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
      salePrice: 45000,
      compareAtPrice: 60000,
      ratingAvg: 4.5,
      availableQty: 30,
      images: [_img('p1')],
    ),
    Product(
      id: 'p2',
      categoryId: 'cat-wearables',
      nameEn: 'Smart Watch',
      nameAr: 'ساعة ذكية',
      description: 'Fitness tracking, notifications and a week of battery.',
      salePrice: 120000,
      compareAtPrice: 150000,
      isNegotiable: true,
      floorPrice: 100000,
      ratingAvg: 4.2,
      availableQty: 12,
      images: [_img('p2')],
    ),
    Product(
      id: 'p3',
      categoryId: 'cat-accessories',
      nameEn: 'Power Bank 20000mAh',
      nameAr: 'باور بانك ٢٠٠٠٠',
      description: 'Fast-charging power bank with two USB outputs.',
      salePrice: 32000,
      compareAtPrice: 40000,
      pointsPrice: 320,
      ratingAvg: 4.0,
      availableQty: 0,
      inStock: false,
      images: [_img('p3')],
    ),
    Product(
      id: 'p4',
      categoryId: 'cat-pantry',
      nameEn: 'Olive Oil 1L',
      nameAr: 'زيت زيتون ١ لتر',
      description: 'Extra-virgin olive oil, cold pressed.',
      salePrice: 15000,
      compareAtPrice: 20000,
      ratingAvg: 4.8,
      availableQty: 80,
      images: [_img('p4')],
    ),
    Product(
      id: 'p5',
      categoryId: 'cat-staples',
      nameEn: 'Basmati Rice 5kg',
      nameAr: 'رز بسمتي ٥ كغم',
      description: 'Aged long-grain basmati rice.',
      salePrice: 22000,
      compareAtPrice: 25000,
      ratingAvg: 4.6,
      availableQty: 50,
      images: [_img('p5')],
    ),
    Product(
      id: 'p6',
      categoryId: 'cat-beverages',
      nameEn: 'Ground Coffee 250g',
      nameAr: 'قهوة مطحونة ٢٥٠ غم',
      description: 'Medium-roast Arabica ground coffee.',
      salePrice: 9000,
      compareAtPrice: 10000,
      ratingAvg: 4.3,
      availableQty: 40,
      images: [_img('p6')],
    ),
    Product(
      id: 'p7',
      categoryId: 'cat-men',
      nameEn: 'Cotton T-Shirt',
      nameAr: 'قميص قطني',
      description: 'Soft cotton t-shirt, several sizes.',
      salePrice: 12000,
      compareAtPrice: 15000,
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
      categoryId: 'cat-men',
      nameEn: 'Denim Jacket',
      nameAr: 'جاكيت جينز',
      description: 'Classic denim jacket.',
      salePrice: 38000,
      compareAtPrice: 45000,
      isNegotiable: true,
      floorPrice: 30000,
      ratingAvg: 4.4,
      availableQty: 15,
      images: [_img('p8')],
    ),
    Product(
      id: 'p9',
      categoryId: 'cat-cookware',
      nameEn: 'Non-stick Pan',
      nameAr: 'مقلاة غير لاصقة',
      description: '28cm non-stick frying pan.',
      salePrice: 18000,
      compareAtPrice: 20000,
      ratingAvg: 4.5,
      availableQty: 25,
      images: [_img('p9')],
    ),
    Product(
      id: 'p10',
      categoryId: 'cat-tableware',
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
      categoryId: 'cat-lighting',
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
      categoryId: 'cat-audio',
      nameEn: 'Bluetooth Speaker',
      nameAr: 'مكبر صوت بلوتوث',
      description: 'Portable waterproof Bluetooth speaker.',
      salePrice: 55000,
      ratingAvg: 4.6,
      availableQty: 18,
      images: [_img('p12')],
    ),
    Product(
      id: 'p13',
      categoryId: 'cat-skincare',
      nameEn: 'Gentle Facial Cleanser',
      nameAr: 'غسول لطيف للوجه',
      salePrice: 12000,
      compareAtPrice: 16000,
      ratingAvg: 4.5,
      availableQty: 30,
      images: [_img('p13')],
    ),
    Product(
      id: 'p14',
      categoryId: 'cat-skincare',
      nameEn: 'Daily Moisturizing Cream',
      nameAr: 'كريم ترطيب يومي',
      salePrice: 18000,
      ratingAvg: 4.4,
      availableQty: 25,
      images: [_img('p14')],
    ),
    Product(
      id: 'p15',
      categoryId: 'cat-haircare',
      nameEn: 'Nourishing Shampoo',
      nameAr: 'شامبو مغذٍ للشعر',
      salePrice: 9000,
      compareAtPrice: 12000,
      ratingAvg: 4.3,
      availableQty: 40,
      images: [_img('p15')],
    ),
    Product(
      id: 'p16',
      categoryId: 'cat-fragrance',
      nameEn: 'Fresh Eau de Parfum',
      nameAr: 'عطر منعش',
      salePrice: 35000,
      ratingAvg: 4.6,
      availableQty: 18,
      images: [_img('p16')],
    ),
    Product(
      id: 'p17',
      categoryId: 'cat-fitness',
      nameEn: 'Yoga Exercise Mat',
      nameAr: 'حصيرة تمارين يوغا',
      salePrice: 18000,
      compareAtPrice: 24000,
      ratingAvg: 4.7,
      availableQty: 20,
      images: [_img('p17')],
    ),
    Product(
      id: 'p18',
      categoryId: 'cat-fitness',
      nameEn: 'Sports Water Bottle',
      nameAr: 'قارورة مياه رياضية',
      salePrice: 8000,
      ratingAvg: 4.2,
      availableQty: 45,
      images: [_img('p18')],
    ),
    Product(
      id: 'p19',
      categoryId: 'cat-outdoors',
      nameEn: 'Rechargeable Camping Lantern',
      nameAr: 'فانوس تخييم قابل للشحن',
      salePrice: 22000,
      compareAtPrice: 28000,
      ratingAvg: 4.5,
      availableQty: 16,
      images: [_img('p19')],
    ),
    Product(
      id: 'p20',
      categoryId: 'cat-cycling',
      nameEn: 'Adjustable Cycling Helmet',
      nameAr: 'خوذة دراجة قابلة للتعديل',
      salePrice: 30000,
      compareAtPrice: 40000,
      ratingAvg: 4.8,
      availableQty: 14,
      images: [_img('p20')],
    ),
  ].map(_withDiscount).toList();

  static Product _withDiscount(Product p) => Product.fromMock({
    ...p.toMock(),
    'discount_percent': Product.discountPercentFor(
      p.salePrice,
      p.compareAtPrice,
    ),
  });

  @override
  Future<List<Category>> fetchCategories() async {
    await Future<void>.delayed(delay);
    Category? visible(Category category) => !category.isActive
        ? null
        : Category.fromMock({
            ...category.toMock(),
            'children': [
              for (final child in category.children)
                if (visible(child) case final Category shown) shown.toMock(),
            ],
          });
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
    return _adminEditedProducts.contains(id)
        ? product
        : product.copyWith(images: _gallery(id));
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
