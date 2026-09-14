import '../../../core/error/failure.dart';
import '../../../core/network/api_client.dart';
import '../../orders/data/order.dart';
import '../domain/admin_order_repository.dart';

class AdminOrderRepositoryRemote implements AdminOrderRepository {
  const AdminOrderRepositoryRemote(this.api);
  final ApiClient api;
  @override
  Future<OrderPage> fetchOrders({
    AdminOrderQuery query = const AdminOrderQuery(),
    int page = 1,
    int perPage = 20,
  }) async {
    query.validate();
    return OrderPage.fromJson(
      await api.get<Map<String, dynamic>>(
        '/admin/orders',
        query: query.parameters(page: page, perPage: perPage),
      ),
    );
  }

  @override
  Future<Order> updateStatus(String id, String status) async {
    if (!adminOrderStatuses.contains(status)) {
      throw const AppFailure(FailureKind.validation);
    }
    return Order.fromJson(
      await api.patch<Map<String, dynamic>>(
        '/orders/$id/status',
        body: {'status': status},
      ),
    );
  }
}
