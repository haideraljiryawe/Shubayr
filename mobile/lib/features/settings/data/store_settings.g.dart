// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'store_settings.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StoreSettings _$StoreSettingsFromJson(Map<String, dynamic> json) =>
    StoreSettings(
      storeName: json['store_name'] as String?,
      logoUrl: json['logo_url'] as String?,
      primaryColor: json['primary_color'] as String?,
      currency: json['currency'] as String?,
    );

Map<String, dynamic> _$StoreSettingsToJson(StoreSettings instance) =>
    <String, dynamic>{
      'store_name': instance.storeName,
      'logo_url': instance.logoUrl,
      'primary_color': instance.primaryColor,
      'currency': instance.currency,
    };
