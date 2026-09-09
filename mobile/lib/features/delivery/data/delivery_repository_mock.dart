import '../../../core/error/failure.dart';
import '../domain/delivery_repository.dart';
import 'delivery.dart';

/// Session-scoped deliveries. Status updates intentionally do not mutate
/// customer orders, payments, stock or loyalty while those links are deferred.
class DeliveryRepositoryMock implements DeliveryRepository {
  DeliveryRepositoryMock({
    required String agentId,
    this.delay = const Duration(milliseconds: 300),
  }) {
    final now = DateTime.now();
    _items = List.generate(45, (index) {
      final status = Delivery.statuses[index % Delivery.statuses.length];
      return Delivery(
        id: '10000000-0000-4000-8000-${(index + 1).toString().padLeft(12, '0')}',
        orderId:
            '20000000-0000-4000-8000-${(index + 1).toString().padLeft(12, '0')}',
        agentId: agentId,
        status: status,
        deliveryFee: 5000,
        dispatchedAt: status == 'assigned'
            ? null
            : now.subtract(Duration(hours: index + 2)),
        deliveredAt: status == 'delivered'
            ? now.subtract(Duration(hours: index + 1))
            : null,
      );
    });
  }

  final Duration delay;
  late final List<Delivery> _items;

  @override
  Future<DeliveryPage> fetchAssigned({int page = 1, int perPage = 20}) async {
    await Future<void>.delayed(delay);
    return DeliveryPage(
      page: page,
      perPage: perPage,
      total: _items.length,
      data: List.unmodifiable(_items.skip((page - 1) * perPage).take(perPage)),
    );
  }

  @override
  Future<Delivery> updateStatus(String id, String status) async {
    await Future<void>.delayed(delay);
    if (!Delivery.updateStatuses.contains(status)) {
      throw const AppFailure(FailureKind.validation);
    }
    final index = _items.indexWhere((item) => item.id == id);
    if (index < 0) throw const AppFailure(FailureKind.notFound);
    final item = _items[index];
    if (item.status == status) return item;
    final now = DateTime.now();
    return _items[index] = Delivery(
      id: item.id,
      orderId: item.orderId,
      agentId: item.agentId,
      deliveryFee: item.deliveryFee,
      status: status,
      dispatchedAt: item.dispatchedAt ?? now,
      deliveredAt: status == 'delivered' ? now : null,
    );
  }
}
