import 'package:shubayr/features/admin/data/admin_order_repository_mock.dart';
import 'package:shubayr/features/admin/domain/admin_order_repository.dart';
import 'package:shubayr/features/orders/data/order.dart';

typedef OrderRead = ({AdminOrderQuery query, int page, int perPage});

class RecordingAdminOrders extends AdminOrderRepositoryMock {
  RecordingAdminOrders()
    : super(delay: Duration.zero, now: DateTime(2026, 9, 9));
  final reads = <OrderRead>[];
  final writes = <({String id, String status})>[];
  Future<OrderPage> Function(OrderRead)? onRead;
  Future<Order> Function(String, String)? onWrite;
  @override
  Future<OrderPage> fetchOrders({
    AdminOrderQuery query = const AdminOrderQuery(),
    int page = 1,
    int perPage = 20,
  }) {
    final request = (query: query, page: page, perPage: perPage);
    reads.add(request);
    return onRead?.call(request) ??
        super.fetchOrders(query: query, page: page, perPage: perPage);
  }

  @override
  Future<Order> updateStatus(String id, String status) {
    writes.add((id: id, status: status));
    return onWrite?.call(id, status) ?? super.updateStatus(id, status);
  }

  Future<Order> persist(String id, String status) =>
      super.updateStatus(id, status);
}
