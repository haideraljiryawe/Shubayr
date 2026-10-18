import 'settings_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/error/failure.dart';
import 'privacy_policy_provider.dart';

final supportDestinationProvider = Provider<String>(
  (ref) => const String.fromEnvironment('SUPPORT_DESTINATION'),
);

/// One explicit destination; never generate contact details or open arbitrary schemes.
Uri? supportUri(String value) {
  if (value.isEmpty || value != value.trim()) return null;
  final uri = Uri.tryParse(value);
  if (uri == null) return null;
  if (uri.scheme == 'https') return privacyPolicyUri(value);
  if (uri.hasQuery || uri.hasFragment || uri.hasAuthority) return null;
  if (uri.scheme == 'tel' &&
      RegExp(r'^\+[1-9][0-9]{7,14}$').hasMatch(uri.path)) {
    return uri;
  }
  if (uri.scheme == 'mailto' &&
      RegExp(
        r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+$",
      ).hasMatch(uri.path)) {
    final host = uri.path.split('@').last;
    if (privacyPolicyUri('https://$host') != null) return uri;
  }
  return null;
}

final openSupportProvider = Provider<Future<void> Function()>((ref) {
  final settings = ref.watch(storeSettingsProvider);
  final value = settings?.supportPhone != null
      ? 'tel:${settings!.supportPhone}'
      : settings?.supportEmail != null
      ? 'mailto:${settings!.supportEmail}'
      : ref.watch(supportDestinationProvider);
  final launch = ref.watch(externalLinkLauncherProvider);
  return () async {
    final uri = supportUri(value);
    if (uri == null) {
      throw const AppFailure(
        FailureKind.validation,
        code: 'SUPPORT_UNAVAILABLE',
      );
    }
    if (!await launch(uri)) {
      throw const AppFailure(FailureKind.unknown, code: 'SUPPORT_OPEN_FAILED');
    }
  };
});
