import '../../../core/error/failure.dart';
import '../../orders/data/order.dart';
import '../../catalog/data/catalog_repository_mock.dart';
import '../domain/admin_order_repository.dart';

/// Store-wide fixtures are separate from the customer's session-owned checkout
/// fixtures. Customer search uses mock server metadata, not invented Order fields.
class AdminOrderRepositoryMock implements AdminOrderRepository {
  AdminOrderRepositoryMock({
    this.delay = const Duration(milliseconds: 300),
    DateTime? now,
  }) {
    final today = now ?? DateTime.now();
    final product = CatalogRepositoryMock.productSnapshot('p1');
    for (var i = 1; i <= 81; i++) {
      final id = 'admin-order-$i';
      _customers[id] = i.isOdd ? 'أحمد Ahmed' : 'علي Ali';
      _orders.add(
        Order(
          id: id,
          orderNumber: 'SH-${3000 + i}',
          status: i <= 45 ? 'pending' : adminOrderStatuses[1 + (i - 46) % 8],
          placedAt: DateTime(
            today.year,
            today.month,
            today.day,
          ).subtract(Duration(days: (i - 1) ~/ 3)),
          subtotal: 45000,
          deliveryFee: 5000,
          total: 50000,
          items: [
            OrderItem(
              id: 'admin-item-$i',
              productId: 'p1',
              productNameAr: product?.nameAr,
              productNameEn: product?.nameEn,
              imageUrl: product?.primaryImage,
              imageSnapshotProvided: true,
              quantity: 1,
              unitPrice: 45000,
              lineTotal: 45000,
            ),
          ],
        ),
      );
    }
  }
  final Duration delay;
  final _orders = <Order>[];
  final _customers = <String, String>{};
  @override
  Future<OrderPage> fetchOrders({
    AdminOrderQuery query = const AdminOrderQuery(),
    int page = 1,
    int perPage = 20,
  }) async {
    query.validate();
    if (page < 1 || perPage < 1) throw const AppFailure(FailureKind.validation);
    await Future<void>.delayed(delay);
    final search = query.search.trim().toLowerCase();
    final filtered =
        _orders.where((order) {
          if (query.status != null && order.status != query.status) {
            return false;
          }
          if (search.isNotEmpty &&
              !order.orderNumber.toLowerCase().contains(search) &&
              !(_customers[order.id] ?? '').toLowerCase().contains(search)) {
            return false;
          }
          final placed = AdminOrderQuery.date(order.placedAt!);
          if (query.from != null &&
              placed.compareTo(AdminOrderQuery.date(query.from!)) < 0) {
            return false;
          }
          if (query.to != null &&
              placed.compareTo(AdminOrderQuery.date(query.to!)) > 0) {
            return false;
          }
          return true;
        }).toList()..sort((a, b) {
          final date = b.placedAt!.compareTo(a.placedAt!);
          return date != 0 ? date : b.orderNumber.compareTo(a.orderNumber);
        });
    return OrderPage(
      page: page,
      perPage: perPage,
      total: filtered.length,
      data: List.unmodifiable(
        filtered.skip((page - 1) * perPage).take(perPage),
      ),
    );
  }

  @override
  Future<Order> updateStatus(String id, String status) async {
    if (!adminOrderStatuses.contains(status)) {
      throw const AppFailure(FailureKind.validation);
    }
    await Future<void>.delayed(delay);
    final index = _orders.indexWhere((o) => o.id == id);
    if (index < 0) throw const AppFailure(FailureKind.notFound);
    // The contract supplies no transition matrix. The remote server decides
    // business eligibility and reservation effects; mock only updates the record.
    return _orders[index] = Order.fromJson({
      ..._orders[index].toJson(),
      'status': status,
    });
  }
}
