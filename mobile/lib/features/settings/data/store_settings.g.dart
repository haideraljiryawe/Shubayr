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
      storeLegalNameAr: json['store_legal_name_ar'] as String?,
      storeLegalNameEn: json['store_legal_name_en'] as String?,
      storeAddressAr: json['store_address_ar'] as String?,
      storeAddressEn: json['store_address_en'] as String?,
      supportPhone: json['support_phone'] as String?,
      supportWhatsapp: json['support_whatsapp'] as String?,
      supportEmail: json['support_email'] as String?,
      privacyEmail: json['privacy_email'] as String?,
      supportHoursAr: json['support_hours_ar'] as String?,
      supportHoursEn: json['support_hours_en'] as String?,
      policyEffectiveDate: json['policy_effective_date'] as String?,
      refundDays: (json['refund_days'] as num?)?.toInt(),
      returnWindowDays: (json['return_window_days'] as num?)?.toInt(),
    );

Map<String, dynamic> _$StoreSettingsToJson(StoreSettings instance) =>
    <String, dynamic>{
      'store_name': instance.storeName,
      'logo_url': instance.logoUrl,
      'primary_color': instance.primaryColor,
      'currency': instance.currency,
      'store_legal_name_ar': instance.storeLegalNameAr,
      'store_legal_name_en': instance.storeLegalNameEn,
      'store_address_ar': instance.storeAddressAr,
      'store_address_en': instance.storeAddressEn,
      'support_phone': instance.supportPhone,
      'support_whatsapp': instance.supportWhatsapp,
      'support_email': instance.supportEmail,
      'privacy_email': instance.privacyEmail,
      'support_hours_ar': instance.supportHoursAr,
      'support_hours_en': instance.supportHoursEn,
      'policy_effective_date': instance.policyEffectiveDate,
      'refund_days': instance.refundDays,
      'return_window_days': instance.returnWindowDays,
    };
