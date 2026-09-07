import 'package:shubayr/features/cart/data/cart_repository_mock.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/data/order_repository_mock.dart';

typedef OrderRequest = ({String? status, int page, int perPage});

class OrderHistoryRepository extends OrderRepositoryMock {
  OrderHistoryRepository({this.orders})
    : super(CartRepositoryMock(delay: Duration.zero), delay: Duration.zero);

  final List<Order>? orders;
  final requests = <OrderRequest>[];
  Future<OrderPage> Function(OrderRequest)? onFetch;

  @override
  Future<OrderPage> fetchOrders({
    String? status,
    int page = 1,
    int perPage = 20,
  }) async {
    final request = (status: status, page: page, perPage: perPage);
    requests.add(request);
    if (onFetch != null) return onFetch!(request);
    if (orders == null) {
      return super.fetchOrders(status: status, page: page, perPage: perPage);
    }
    final filtered = orders!
        .where((order) => status == null || order.status == status)
        .toList();
    return OrderPage(
      page: page,
      perPage: perPage,
      total: filtered.length,
      data: filtered.skip((page - 1) * perPage).take(perPage).toList(),
    );
  }
}
