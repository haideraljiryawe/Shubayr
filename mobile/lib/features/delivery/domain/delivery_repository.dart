import '../data/delivery.dart';

abstract interface class DeliveryRepository {
  /// GET /deliveries/assigned — scoped to the authenticated agent.
  Future<DeliveryPage> fetchAssigned({
    String? status,
    int page = 1,
    int perPage = 20,
  });

  /// PATCH /deliveries/{id} — versioned status and conditional delivered collection.
  Future<Delivery> updateStatus(
    String id,
    String status, {
    required int orderVersion,
    String? reason,
    String? operationId,
    String? collectionConfirmation,
    String? collectedAmount,
  });
}
