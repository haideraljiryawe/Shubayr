import '../../../core/network/api_client.dart';
import '../domain/delivery_repository.dart';
import 'delivery.dart';

class DeliveryRepositoryRemote implements DeliveryRepository {
  const DeliveryRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<DeliveryPage> fetchAssigned({int page = 1, int perPage = 20}) async =>
      DeliveryPage.fromJson(
        await _api.get<Map<String, dynamic>>(
          '/deliveries/assigned',
          query: {'page': page, 'per_page': perPage},
        ),
      );

  @override
  Future<Delivery> updateStatus(String id, String status) async =>
      Delivery.fromJson(
        await _api.patch<Map<String, dynamic>>(
          '/deliveries/$id',
          body: {'status': status},
        ),
      );
}
