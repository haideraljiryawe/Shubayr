import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/error/failure.dart';

final privacyPolicyUrlProvider = Provider<String>(
  (ref) => const String.fromEnvironment('PRIVACY_POLICY_URL'),
);
final externalLinkLauncherProvider = Provider<Future<bool> Function(Uri)>(
  (ref) =>
      (uri) => launchUrl(uri, mode: LaunchMode.externalApplication),
);

Uri? privacyPolicyUri(String value) {
  try {
    // Apply the same production DNS/HTTPS restrictions, even in debug builds.
    AppConfig(
      apiBaseUrl: value,
      dataSource: DataSource.remote,
    ).validate(production: true);
    return Uri.parse(value);
  } on AppFailure {
    return null;
  }
}

final openPrivacyPolicyProvider = Provider<Future<void> Function()>((ref) {
  final value = ref.watch(privacyPolicyUrlProvider);
  final launch = ref.watch(externalLinkLauncherProvider);
  return () async {
    final uri = privacyPolicyUri(value);
    if (uri == null) {
      throw const AppFailure(
        FailureKind.validation,
        code: 'PRIVACY_POLICY_UNAVAILABLE',
      );
    }
    if (!await launch(uri)) {
      throw const AppFailure(
        FailureKind.unknown,
        code: 'PRIVACY_POLICY_OPEN_FAILED',
      );
    }
  };
});
