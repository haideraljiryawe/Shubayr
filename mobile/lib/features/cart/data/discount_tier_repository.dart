import '../../../core/network/api_client.dart';
import '../../../core/error/response_decode.dart';
import 'cart.dart';

class DiscountTierSettings {
  const DiscountTierSettings({
    required this.currency,
    required this.couponStackingEnabled,
    required this.tiers,
  });
  final String currency;
  final bool couponStackingEnabled;
  final List<DiscountTier> tiers;
  factory DiscountTierSettings.fromJson(Map<String, dynamic> json) =>
      DiscountTierSettings(
        currency: json['currency'] as String,
        couponStackingEnabled: json['coupon_stacking_enabled'] as bool,
        tiers: (json['tiers'] as List)
            .map(
              (value) => DiscountTier.fromJson(value as Map<String, dynamic>),
            )
            .toList(),
      );
}

class DiscountTierRepository {
  const DiscountTierRepository(this.api);
  final ApiClient api;
  Future<DiscountTierSettings> fetch() => decodeResponse(
    () async => DiscountTierSettings.fromJson(
      await api.get<Map<String, dynamic>>('/discount-tiers'),
    ),
  );
}
