import '../domain/delivery_collection_input.dart';
import '../../../core/error/failure.dart';
import '../domain/delivery_repository.dart';
import 'delivery.dart';

/// Test-only deliveries with version checks and repeat-safe collection writes.
class DeliveryRepositoryMock implements DeliveryRepository {
  DeliveryRepositoryMock({
    required String agentId,
    this.delay = const Duration(milliseconds: 300),
  }) {
    final now = DateTime.now();
    _items = List.generate(45, (index) {
      final status = Delivery.statuses[index % Delivery.statuses.length];
      return Delivery(
        amountDue: 25000,
        id: '10000000-0000-4000-8000-${(index + 1).toString().padLeft(12, '0')}',
        orderId:
            '20000000-0000-4000-8000-${(index + 1).toString().padLeft(12, '0')}',
        agentId: agentId,
        orderVersion: 1,
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
  final _collections = <String, ({Object payload, Delivery result})>{};

  @override
  Future<DeliveryPage> fetchAssigned({
    String? status,
    int page = 1,
    int perPage = 20,
  }) async {
    await Future<void>.delayed(delay);
    final filtered = _items.where(
      (item) => status == null || item.status == status,
    );
    return DeliveryPage(
      page: page,
      perPage: perPage,
      total: filtered.length,
      data: List.unmodifiable(
        filtered.skip((page - 1) * perPage).take(perPage),
      ),
    );
  }

  @override
  Future<Delivery> updateStatus(
    String id,
    String status, {
    required int orderVersion,
    String? reason,
    String? operationId,
    String? collectionConfirmation,
    String? collectedAmount,
  }) async {
    await Future<void>.delayed(delay);
    if (!Delivery.updateStatuses.contains(status)) {
      throw const AppFailure(FailureKind.validation);
    }
    final payload = (
      id,
      status,
      orderVersion,
      collectionConfirmation,
      collectedAmount,
    );
    final previous = _collections[operationId];
    if (previous != null) {
      if (previous.payload != payload) {
        throw const AppFailure(FailureKind.conflict, statusCode: 409);
      }
      return previous.result;
    }
    final index = _items.indexWhere((item) => item.id == id);
    if (index < 0) throw const AppFailure(FailureKind.notFound);
    final item = _items[index];
    if (item.orderVersion != orderVersion) {
      throw const AppFailure(FailureKind.validation, statusCode: 409);
    }
    if (status == 'failed' &&
        (reason == null ||
            reason.trim().isEmpty ||
            reason.trim().length > 500)) {
      throw const AppFailure(FailureKind.validation);
    }
    if (item.status == status) return item;
    if (!item.nextStatuses.contains(status)) {
      throw const AppFailure(FailureKind.validation, statusCode: 409);
    }
    if (status == 'delivered') {
      if (operationId == null ||
          operationId.length < 8 ||
          operationId.length > 128 ||
          !['confirmed', 'unconfirmed'].contains(collectionConfirmation) ||
          (collectionConfirmation == 'confirmed' && collectedAmount == null) ||
          (collectionConfirmation == 'unconfirmed' &&
              collectedAmount != null)) {
        throw const AppFailure(FailureKind.validation, statusCode: 422);
      }
      if (collectedAmount != null) {
        DeliveryCollectionInput.confirmed(
          collectedAmount,
        ).validate(item.amountDue);
      }
    }
    final now = DateTime.now();
    final result = _items[index] = Delivery(
      amountDue: item.amountDue,
      id: item.id,
      orderId: item.orderId,
      orderVersion: orderVersion + 1,
      failureReason: status == 'failed' ? reason : null,
      failedAt: status == 'failed' ? now : item.failedAt,
      retryCount:
          item.retryCount +
          (item.status == 'failed' && status == 'out_for_delivery' ? 1 : 0),
      agentId: item.agentId,
      deliveryFee: item.deliveryFee,
      currency: item.currency,
      status: status,
      dispatchedAt: item.dispatchedAt ?? now,
      deliveredAt: status == 'delivered' ? now : item.deliveredAt,
    );
    if (status == 'delivered') {
      _collections[operationId!] = (payload: payload, result: result);
    }
    return result;
  }
}
