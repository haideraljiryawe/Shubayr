import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/features/settings/presentation/providers/privacy_policy_provider.dart';

void main() {
  test(
    'unpublished, local and non-HTTPS privacy values cannot launch',
    () async {
      for (final value in [
        '',
        'http://shubayr.com/privacy',
        'https://localhost/privacy',
        'https://192.168.1.2/privacy',
        'https://example.com/privacy',
        'javascript:alert(1)',
      ]) {
        var launched = false;
        final c = ProviderContainer(
          overrides: [
            privacyPolicyUrlProvider.overrideWithValue(value),
            externalLinkLauncherProvider.overrideWithValue((uri) async {
              launched = true;
              return true;
            }),
          ],
        );
        await expectLater(
          c.read(openPrivacyPolicyProvider)(),
          throwsA(
            isA<AppFailure>().having(
              (e) => e.code,
              'code',
              'PRIVACY_POLICY_UNAVAILABLE',
            ),
          ),
        );
        expect(launched, isFalse);
        c.dispose();
      }
    },
  );
  test('configured policy launches the exact external HTTPS URL', () async {
    Uri? opened;
    final c = ProviderContainer(
      overrides: [
        privacyPolicyUrlProvider.overrideWithValue(
          'https://shubayr.com/privacy',
        ),
        externalLinkLauncherProvider.overrideWithValue((uri) async {
          opened = uri;
          return true;
        }),
      ],
    );
    addTearDown(c.dispose);
    await c.read(openPrivacyPolicyProvider)();
    expect(opened.toString(), 'https://shubayr.com/privacy');
  });
}
