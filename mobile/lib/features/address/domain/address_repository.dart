import '../data/address.dart';

/// The user's delivery addresses (auth required). Mutations return the saved
/// [Address], including its confirmed default flag.
abstract interface class AddressRepository {
  /// `GET /addresses`.
  Future<AddressPage> fetchAddresses({int page = 1, int perPage = 20});

  /// `POST /addresses`.
  Future<Address> createAddress(AddressInput input);

  /// `PATCH /addresses/{id}`.
  Future<Address> updateAddress(String id, AddressInput input);

  /// `DELETE /addresses/{id}`.
  Future<void> deleteAddress(String id);
}
