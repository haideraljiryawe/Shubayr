import 'package:json_annotation/json_annotation.dart';

part 'address.g.dart';

/// A saved delivery address. Shapes match `Address` in `api/openapi.yaml`. The
/// list is user-scoped (auth required). `lat`/`lng` come from the contract but
/// aren't edited here yet (no map picker); they round-trip untouched.
@JsonSerializable(explicitToJson: true)
class Address {
  const Address({
    required this.id,
    this.userId,
    this.label = '',
    required this.city,
    this.area = '',
    this.street = '',
    this.details,
    this.lat,
    this.lng,
    this.isDefault = false,
  });

  final String id;
  @JsonKey(name: 'user_id')
  final String? userId;
  final String label;
  final String city;
  final String area;
  final String street;
  final String? details;
  final num? lat;
  final num? lng;
  @JsonKey(name: 'is_default')
  final bool isDefault;

  /// Builds the write payload from this address, optionally overriding the
  /// default flag (used by "set as default").
  AddressInput toInput({bool? isDefault}) => AddressInput(
    label: label,
    city: city,
    area: area,
    street: street,
    details: details,
    lat: lat,
    lng: lng,
    isDefault: isDefault ?? this.isDefault,
  );

  factory Address.fromJson(Map<String, dynamic> json) =>
      _$AddressFromJson(json);

  Map<String, dynamic> toJson() => _$AddressToJson(this);
}

/// Create/update payload. Matches `AddressInput` in `api/openapi.yaml`.
@JsonSerializable(createFactory: false)
class AddressInput {
  const AddressInput({
    this.label = '',
    required this.city,
    this.area = '',
    this.street = '',
    this.details,
    this.lat,
    this.lng,
    this.isDefault = false,
  });

  final String label;
  final String city;
  final String area;
  final String street;
  final String? details;
  final num? lat;
  final num? lng;
  @JsonKey(name: 'is_default')
  final bool isDefault;

  Map<String, dynamic> toJson() => _$AddressInputToJson(this);
}

/// One page of addresses. Matches `AddressPage` in `api/openapi.yaml`.
@JsonSerializable(explicitToJson: true)
class AddressPage {
  const AddressPage({
    this.page = 1,
    this.perPage = 20,
    this.total = 0,
    this.data = const [],
  });

  final int page;
  @JsonKey(name: 'per_page')
  final int perPage;
  final int total;
  final List<Address> data;

  factory AddressPage.fromJson(Map<String, dynamic> json) =>
      _$AddressPageFromJson(json);

  Map<String, dynamic> toJson() => _$AddressPageToJson(this);
}
