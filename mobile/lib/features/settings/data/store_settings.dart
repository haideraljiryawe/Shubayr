import 'package:json_annotation/json_annotation.dart';

part 'store_settings.g.dart';

/// `StoreSettings` exactly as defined in `api/openapi.yaml` (`GET /settings`).
///
/// Every field is optional on purpose: the contract marks none of them as
/// required, and the app must render with whatever subset arrives.
@JsonSerializable(fieldRename: FieldRename.snake)
class StoreSettings {
  const StoreSettings({
    this.storeName,
    this.logoUrl,
    this.primaryColor,
    this.currency,
    this.storeLegalNameAr,
    this.storeLegalNameEn,
    this.storeAddressAr,
    this.storeAddressEn,
    this.supportPhone,
    this.supportWhatsapp,
    this.supportEmail,
    this.privacyEmail,
    this.supportHoursAr,
    this.supportHoursEn,
    this.policyEffectiveDate,
    this.refundDays,
    this.returnWindowDays,
  });

  factory StoreSettings.fromJson(Map<String, dynamic> json) =>
      _$StoreSettingsFromJson(json);

  final String? storeName;
  final String? logoUrl;

  /// Hex string, e.g. `#5B8F6B`.
  final String? primaryColor;

  /// ISO-4217 code, e.g. `IQD`.
  final String? currency;
  final String? storeLegalNameAr;
  final String? storeLegalNameEn;
  final String? storeAddressAr;
  final String? storeAddressEn;
  final String? supportPhone;
  final String? supportWhatsapp;
  final String? supportEmail;
  final String? privacyEmail;
  final String? supportHoursAr;
  final String? supportHoursEn;
  final String? policyEffectiveDate;
  final int? refundDays, returnWindowDays;

  Map<String, dynamic> toJson() => _$StoreSettingsToJson(this);
}
