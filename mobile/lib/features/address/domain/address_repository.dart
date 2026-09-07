import '../data/address.dart';

/// The user's delivery addresses (auth required). Mutations return the saved
/// [Address]; the controller re-reads the list so defaults stay consistent.
abstract interface class AddressRepository {
  /// `GET /addresses`.
  Future<List<Address>> fetchAddresses();

  /// `POST /addresses`.
  Future<Address> createAddress(AddressInput input);

  /// `PATCH /addresses/{id}`.
  Future<Address> updateAddress(String id, AddressInput input);

  /// `DELETE /addresses/{id}`.
  Future<void> deleteAddress(String id);
}
