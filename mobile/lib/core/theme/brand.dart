import 'package:flutter/foundation.dart' show immutable;
import 'package:flutter/painting.dart';

import 'tokens/color_primitives.dart';

/// Runtime brand identity.
///
/// Populated from `GET /settings` (`StoreSettings`) when available, otherwise
/// from the bundled defaults. Deliberately free of any feature imports so the
/// theme layer stays standalone.
@immutable
class Brand {
  const Brand({
    this.name,
    this.logoUrl,
    required this.primaryColor,
    required this.currencyCode,
  });

  /// Bundled fallback identity. [name] is intentionally null: the UI shows a
  /// localised neutral label until the API tells us the real store name, so
  /// no store name is hard-coded in the app.
  const Brand.bundled()
    : name = null,
      logoUrl = null,
      primaryColor = ColorPrimitives.green500,
      currencyCode = 'IQD';

  final String? name;
  final String? logoUrl;
  final Color primaryColor;
  final String currencyCode;

  Brand copyWith({
    String? name,
    String? logoUrl,
    Color? primaryColor,
    String? currencyCode,
  }) => Brand(
    name: name ?? this.name,
    logoUrl: logoUrl ?? this.logoUrl,
    primaryColor: primaryColor ?? this.primaryColor,
    currencyCode: currencyCode ?? this.currencyCode,
  );

  @override
  bool operator ==(Object other) =>
      other is Brand &&
      other.name == name &&
      other.logoUrl == logoUrl &&
      other.primaryColor == primaryColor &&
      other.currencyCode == currencyCode;

  @override
  int get hashCode => Object.hash(name, logoUrl, primaryColor, currencyCode);
}
