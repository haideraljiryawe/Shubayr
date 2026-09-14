import '../../../core/error/failure.dart';
import '../../cart/domain/cart_repository.dart';
import '../../catalog/data/catalog_repository_mock.dart';
import '../domain/order_repository.dart';
import 'coupon.dart';
import 'order.dart';
import 'order_tracking.dart';

/// In-memory orders for development. Checkout prices the order from the current
/// cart, applies a flat delivery fee, and clears the cart (as the server does).
/// Placed orders are kept in [_orders] so the orders list and tracking can read
/// them back; a few demo orders are seeded so the list isn't empty for a fresh
/// account. Two demo coupons: SAVE10 (10%) and WELCOME (fixed 5,000).
class OrderRepositoryMock implements OrderRepository {
  OrderRepositoryMock(
    this._cart, {
    this.delay = const Duration(milliseconds: 300),
  }) {
    _seed();
  }

  final CartRepository _cart;
  final Duration delay;

  static const num _deliveryFee = 5000;
  var _seq = 1070;
  final List<Order> _orders = [];

  /// The normal forward lifecycle used to build a tracking timeline.
  static const _progression = [
    'pending',
    'confirmed',
    'processing',
    'out_for_delivery',
    'delivered',
  ];

  void _seed() {
    final now = DateTime.now();
    _orders.addAll([
      _demoOrder(
        number: 1063,
        status: 'pending',
        placedAt: now.subtract(const Duration(minutes: 20)),
        lines: const [('p2', null, 1)],
      ),
      _demoOrder(
        number: 1061,
        status: 'processing',
        placedAt: now.subtract(const Duration(hours: 3)),
        lines: const [('p1', null, 1), ('p9', null, 2)],
      ),
      _demoOrder(
        number: 1057,
        status: 'out_for_delivery',
        placedAt: now.subtract(const Duration(days: 1, hours: 4)),
        lines: const [('p3', null, 1)],
      ),
      _demoOrder(
        number: 1042,
        status: 'delivered',
        placedAt: now.subtract(const Duration(days: 6)),
        lines: const [('p5', null, 3), ('p11', null, 1)],
      ),
      // Older history exercises multiple pages, including a filtered history
      // longer than one page. Keep the original four demo orders at the top.
      for (var i = 0; i < 48; i++)
        _demoOrder(
          number: 1041 - i,
          status: i.isEven
              ? 'delivered'
              : const [
                  'pending',
                  'confirmed',
                  'processing',
                  'out_for_delivery',
                  'failed_delivery',
                  'cancelled',
                  'return_requested',
                  'returned',
                ][(i ~/ 2) % 8],
          placedAt: now.subtract(Duration(days: 7 + i)),
          lines: const [('p2', null, 1)],
        ),
    ]);
  }

  Order _demoOrder({
    required int number,
    required String status,
    required DateTime placedAt,
    required List<(String, String?, int)> lines,
  }) {
    final items = [
      for (final (productId, variantId, qty) in lines)
        () {
          final unit = CatalogRepositoryMock.unitPrice(productId, variantId);
          final product = CatalogRepositoryMock.productSnapshot(productId);
          return OrderItem(
            id: 'oi-$number-$productId',
            productId: productId,
            variantId: variantId,
            productNameAr: product?.nameAr,
            productNameEn: product?.nameEn,
            imageUrl: product?.primaryImage,
            imageSnapshotProvided: true,
            quantity: qty,
            unitPrice: unit,
            lineTotal: unit * qty,
          );
        }(),
    ];
    final subtotal = items.fold<num>(0, (s, i) => s + i.lineTotal);
    return Order(
      id: 'order-$number',
      orderNumber: 'SH-$number',
      status: status,
      paymentMethod: 'cod',
      addressId: 'addr-1',
      subtotal: subtotal,
      deliveryFee: _deliveryFee,
      discount: 0,
      total: subtotal + _deliveryFee,
      placedAt: placedAt,
      items: items,
    );
  }

  @override
  Future<Coupon> validateCoupon(String code) async {
    await Future<void>.delayed(delay);
    return switch (code.trim().toUpperCase()) {
      'SAVE10' => const Coupon(code: 'SAVE10', type: 'percentage', value: 10),
      'WELCOME' => const Coupon(code: 'WELCOME', type: 'fixed', value: 5000),
      _ => throw const AppFailure(FailureKind.notFound),
    };
  }

  @override
  Future<Order> placeOrder({
    required String addressId,
    String? couponCode,
  }) async {
    await Future<void>.delayed(delay);
    final cart = await _cart.fetchCart();
    final subtotal = cart.subtotal;

    num discount = 0;
    if (couponCode != null && couponCode.trim().isNotEmpty) {
      discount = (await validateCoupon(couponCode)).discountOn(subtotal);
    }
    final total = subtotal + _deliveryFee - discount;

    final number = _seq++;
    final order = Order(
      id: 'order-$number',
      orderNumber: 'SH-$number',
      status: 'pending',
      paymentMethod: 'cod',
      addressId: addressId,
      subtotal: subtotal,
      deliveryFee: _deliveryFee,
      discount: discount,
      total: total,
      placedAt: DateTime.now(),
      items: cart.items.map((i) {
        final product = CatalogRepositoryMock.productSnapshot(i.productId);
        return OrderItem(
          id: 'oi-${i.id}',
          productId: i.productId,
          variantId: i.variantId,
          productNameAr: product?.nameAr,
          productNameEn: product?.nameEn,
          imageUrl: product?.primaryImage,
          imageSnapshotProvided: true,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          lineTotal: i.lineTotal,
        );
      }).toList(),
    );
    _orders.add(order);

    // Placing the order consumes the cart, mirroring the server.
    for (final i in cart.items) {
      await _cart.removeItem(i.id);
    }
    return order;
  }

  @override
  Future<OrderPage> fetchOrders({
    String? status,
    int page = 1,
    int perPage = 20,
  }) async {
    await Future<void>.delayed(delay);
    final all = [..._orders]
      ..sort((a, b) {
        final at = a.placedAt, bt = b.placedAt;
        if (at == null || bt == null) return 0;
        return bt.compareTo(at); // newest first
      });
    final filtered = status == null
        ? all
        : all.where((o) => o.status == status).toList();
    final start = (page - 1) * perPage;
    final slice = start >= filtered.length
        ? const <Order>[]
        : filtered.sublist(start, (start + perPage).clamp(0, filtered.length));
    return OrderPage(
      page: page,
      perPage: perPage,
      total: filtered.length,
      data: slice,
    );
  }

  @override
  Future<Order> fetchOrder(String id) async {
    await Future<void>.delayed(delay);
    return _orders.firstWhere(
      (o) => o.id == id,
      orElse: () => throw const AppFailure(FailureKind.notFound),
    );
  }

  @override
  Future<OrderTracking> fetchTracking(String id) async {
    await Future<void>.delayed(delay);
    final order = _orders.firstWhere(
      (o) => o.id == id,
      orElse: () => throw const AppFailure(FailureKind.notFound),
    );
    final placedAt = order.placedAt ?? DateTime.now();

    List<String> path;
    if (order.status == 'cancelled') {
      path = ['pending', 'cancelled'];
    } else {
      final idx = _progression.indexOf(order.status);
      path = idx >= 0 ? _progression.sublist(0, idx + 1) : [order.status];
    }

    return OrderTracking(
      orderId: order.id,
      events: [
        for (var i = 0; i < path.length; i++)
          OrderEvent(
            status: path[i],
            at: placedAt.add(Duration(hours: i * 6)),
          ),
      ],
    );
  }

  @override
  Future<Order> cancelOrder(String id) async {
    await Future<void>.delayed(delay);
    final index = _orders.indexWhere((o) => o.id == id);
    if (index < 0) throw const AppFailure(FailureKind.notFound);
    final cancelled = _copyWithStatus(_orders[index], 'cancelled');
    _orders[index] = cancelled;
    return cancelled;
  }

  Order _copyWithStatus(Order o, String status) => Order(
    id: o.id,
    orderNumber: o.orderNumber,
    status: status,
    paymentMethod: o.paymentMethod,
    addressId: o.addressId,
    subtotal: o.subtotal,
    deliveryFee: o.deliveryFee,
    discount: o.discount,
    total: o.total,
    placedAt: o.placedAt,
    items: o.items,
  );
}
