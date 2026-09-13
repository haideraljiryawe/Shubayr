import '../../../core/error/failure.dart';
import '../../../core/utils/validators.dart';
import '../domain/address_repository.dart';
import 'address.dart';

/// In-memory addresses for development. Enforces a single default (setting one
/// clears the others), the same invariant the server keeps. Ten addresses
/// exercise multiple pages in the address list and checkout picker.
class AddressRepositoryMock implements AddressRepository {
  AddressRepositoryMock({this.delay = const Duration(milliseconds: 250)});

  final Duration delay;
  var _seq = 10;

  final List<Address> _items = [
    const Address(
      id: 'addr-0',
      contactPhone: '07700000000',
      label: 'المنزل',
      city: 'بغداد',
      area: 'الكرادة',
      street: 'شارع ٦٢',
      isDefault: true,
    ),
    for (var i = 1; i < 10; i++)
      Address(
        id: 'addr-$i',
        contactPhone: '07810000000',
        label: 'عنوان $i',
        city: 'بغداد',
        area: 'الكرادة',
        street: 'شارع $i',
      ),
  ];

  Address _fromInput(String id, String? userId, AddressInput input) => Address(
    id: id,
    userId: userId,
    label: input.label,
    city: input.city,
    area: input.area,
    street: input.street,
    details: input.details,
    contactPhone: Validators.normalizePhone(input.contactPhone!),
    lat: input.lat,
    lng: input.lng,
    isDefault: input.isDefault,
  );

  void _validateContact(AddressInput input) {
    if (!Validators.isPhone(input.contactPhone ?? '')) {
      throw const AppFailure(FailureKind.validation);
    }
  }

  void _clearOtherDefaults(String keepId) {
    for (var i = 0; i < _items.length; i++) {
      final a = _items[i];
      if (a.id != keepId && a.isDefault) {
        _items[i] = _fromInput(a.id, a.userId, a.toInput(isDefault: false));
      }
    }
  }

  @override
  Future<AddressPage> fetchAddresses({int page = 1, int perPage = 20}) async {
    await Future<void>.delayed(delay);
    return AddressPage(
      page: page,
      perPage: perPage,
      total: _items.length,
      data: List.unmodifiable(_items.skip((page - 1) * perPage).take(perPage)),
    );
  }

  @override
  Future<Address> createAddress(AddressInput input) async {
    await Future<void>.delayed(delay);
    _validateContact(input);
    final address = _fromInput('addr-${_seq++}', 'mock-user', input);
    _items.add(address);
    if (address.isDefault) _clearOtherDefaults(address.id);
    return address;
  }

  @override
  Future<Address> updateAddress(String id, AddressInput input) async {
    await Future<void>.delayed(delay);
    _validateContact(input);
    final i = _items.indexWhere((a) => a.id == id);
    if (i < 0) throw StateError('address not found: $id');
    final updated = _fromInput(id, _items[i].userId, input);
    _items[i] = updated;
    if (updated.isDefault) _clearOtherDefaults(id);
    return updated;
  }

  @override
  Future<void> deleteAddress(String id) async {
    await Future<void>.delayed(delay);
    _items.removeWhere((a) => a.id == id);
  }
}
