// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'address.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Address _$AddressFromJson(Map<String, dynamic> json) => Address(
  id: json['id'] as String,
  userId: json['user_id'] as String?,
  label: json['label'] as String? ?? '',
  city: json['city'] as String,
  area: json['area'] as String? ?? '',
  street: json['street'] as String? ?? '',
  details: json['details'] as String?,
  contactPhone: json['contact_phone'] as String?,
  lat: json['lat'] as num?,
  lng: json['lng'] as num?,
  isDefault: json['is_default'] as bool? ?? false,
);

Map<String, dynamic> _$AddressToJson(Address instance) => <String, dynamic>{
  'id': instance.id,
  'user_id': instance.userId,
  'label': instance.label,
  'city': instance.city,
  'area': instance.area,
  'street': instance.street,
  'details': instance.details,
  'contact_phone': instance.contactPhone,
  'lat': instance.lat,
  'lng': instance.lng,
  'is_default': instance.isDefault,
};

Map<String, dynamic> _$AddressInputToJson(AddressInput instance) =>
    <String, dynamic>{
      'label': instance.label,
      'city': instance.city,
      'area': instance.area,
      'street': instance.street,
      'details': instance.details,
      'contact_phone': instance.contactPhone,
      'lat': instance.lat,
      'lng': instance.lng,
      'is_default': instance.isDefault,
    };

AddressPage _$AddressPageFromJson(Map<String, dynamic> json) => AddressPage(
  page: (json['page'] as num?)?.toInt() ?? 1,
  perPage: (json['per_page'] as num?)?.toInt() ?? 20,
  total: (json['total'] as num?)?.toInt() ?? 0,
  data:
      (json['data'] as List<dynamic>?)
          ?.map((e) => Address.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
);

Map<String, dynamic> _$AddressPageToJson(AddressPage instance) =>
    <String, dynamic>{
      'page': instance.page,
      'per_page': instance.perPage,
      'total': instance.total,
      'data': instance.data.map((e) => e.toJson()).toList(),
    };
