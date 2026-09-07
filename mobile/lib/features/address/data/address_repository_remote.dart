import '../../../core/network/api_client.dart';
import '../domain/address_repository.dart';
import 'address.dart';

class AddressRepositoryRemote implements AddressRepository {
  const AddressRepositoryRemote(this._api);

  final ApiClient _api;

  @override
  Future<List<Address>> fetchAddresses() async {
    final json = await _api.get<Map<String, dynamic>>(
      '/addresses',
      query: {'per_page': 100},
    );
    return AddressPage.fromJson(json).data;
  }

  @override
  Future<Address> createAddress(AddressInput input) async => Address.fromJson(
    await _api.post<Map<String, dynamic>>('/addresses', body: input.toJson()),
  );

  @override
  Future<Address> updateAddress(String id, AddressInput input) async =>
      Address.fromJson(
        await _api.patch<Map<String, dynamic>>(
          '/addresses/$id',
          body: input.toJson(),
        ),
      );

  @override
  Future<void> deleteAddress(String id) => _api.deleteVoid('/addresses/$id');
}
