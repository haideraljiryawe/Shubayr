import 'package:shubayr/features/settings/data/store_settings.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/features/settings/presentation/providers/support_provider.dart';
import 'package:shubayr/features/settings/presentation/providers/privacy_policy_provider.dart';

void main() {
  test('published store contact overrides the bundled destination', () async {
    Uri? opened;
    final container = ProviderContainer(
      overrides: [
        storeSettingsProvider.overrideWith(_PublishedSettings.new),
        supportDestinationProvider.overrideWithValue(
          'https://shubayr.com/help',
        ),
        externalLinkLauncherProvider.overrideWithValue((uri) async {
          opened = uri;
          return true;
        }),
      ],
    );
    addTearDown(container.dispose);
    await container.read(openSupportProvider)();
    expect(opened.toString(), 'tel:+9647700000000');
  });
  test('missing, development and unsafe destinations never launch', () async {
    for (final value in [
      '',
      'http://shubayr.com/help',
      'https://localhost/help',
      'https://192.168.1.2/help',
      'https://example.com/help',
      'javascript:alert(1)',
      'mailto:help@example.com',
      'mailto:a@shubayr.com?bcc=b@shubayr.com',
      'tel:07700000000',
    ]) {
      var launches = 0;
      final c = ProviderContainer(
        overrides: [
          storeSettingsProvider.overrideWith(_EmptySettings.new),
          supportDestinationProvider.overrideWithValue(value),
          externalLinkLauncherProvider.overrideWithValue((uri) async {
            launches++;
            return true;
          }),
        ],
      );
      await expectLater(
        c.read(openSupportProvider)(),
        throwsA(
          isA<AppFailure>().having(
            (e) => e.code,
            'code',
            'SUPPORT_UNAVAILABLE',
          ),
        ),
      );
      expect(launches, 0);
      c.dispose();
    }
  });
  test(
    'configured destination is opened exactly and launch failure is actionable',
    () async {
      // Isolated launch fakes; these are not official production contacts.
      for (final value in [
        'https://shubayr.com/help',
        'mailto:help@shubayr.com',
        'tel:+9647700000000',
      ]) {
        Uri? opened;
        var succeeds = true;
        final c = ProviderContainer(
          overrides: [
            storeSettingsProvider.overrideWith(_EmptySettings.new),
            supportDestinationProvider.overrideWithValue(value),
            externalLinkLauncherProvider.overrideWithValue((uri) async {
              opened = uri;
              return succeeds;
            }),
          ],
        );
        await c.read(openSupportProvider)();
        expect(opened.toString(), value);
        succeeds = false;
        await expectLater(
          c.read(openSupportProvider)(),
          throwsA(
            isA<AppFailure>().having(
              (e) => e.code,
              'code',
              'SUPPORT_OPEN_FAILED',
            ),
          ),
        );
        c.dispose();
      }
    },
  );
}

class _EmptySettings extends StoreSettingsController {
  @override
  StoreSettings? build() => null;
}

class _PublishedSettings extends StoreSettingsController {
  @override
  StoreSettings? build() => const StoreSettings(supportPhone: '+9647700000000');
}
