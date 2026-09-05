import 'package:flutter/widgets.dart';

import 'generated/app_localizations.dart';

/// `context.l10n.someKey` — keeps user-facing strings out of widget code.
extension L10nContextX on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);
}
