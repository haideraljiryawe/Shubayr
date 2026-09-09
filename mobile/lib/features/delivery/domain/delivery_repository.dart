import '../data/delivery.dart';

abstract interface class DeliveryRepository {
  /// GET /deliveries/assigned — scoped to the authenticated agent.
  Future<DeliveryPage> fetchAssigned({int page = 1, int perPage = 20});

  /// PATCH /deliveries/{id} — only a delivery status, no payment operation.
  Future<Delivery> updateStatus(String id, String status);
}
