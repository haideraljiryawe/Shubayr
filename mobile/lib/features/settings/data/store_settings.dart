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
  });

  factory StoreSettings.fromJson(Map<String, dynamic> json) =>
      _$StoreSettingsFromJson(json);

  final String? storeName;
  final String? logoUrl;

  /// Hex string, e.g. `#5B8F6B`.
  final String? primaryColor;

  /// ISO-4217 code, e.g. `IQD`.
  final String? currency;

  Map<String, dynamic> toJson() => _$StoreSettingsToJson(this);
}
