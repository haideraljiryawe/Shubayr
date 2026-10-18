import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/features/notifications/domain/push_lifecycle.dart';
import 'package:shubayr/features/notifications/presentation/push_permission_tile.dart';
import 'package:shubayr/features/notifications/presentation/push_providers.dart';

const _channel = MethodChannel('com.shubayr.app/notification_settings');
const _owner = (userId: 'a', revision: 1, locale: 'en');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late List<MethodCall> calls;
  late Future<bool> Function() open;
  PushOwner? owner;

  setUp(() {
    calls = [];
    owner = _owner;
    open = () async => true;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_channel, (call) async {
          calls.add(call);
          return open();
        });
  });
  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_channel, null);
  });

  Future<ProviderContainer> mount(
    WidgetTester tester, {
    String language = 'en',
  }) async {
    final container = ProviderContainer(
      overrides: [
        pushOwnerProvider.overrideWith((ref) => owner),
        // Opening settings must not request permission or alter FCM directly.
        pushLifecycleProvider.overrideWith(
          (ref) => throw StateError('Unexpected lifecycle access'),
        ),
      ],
    );
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          locale: Locale(language),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: const Scaffold(body: PushPermissionTile()),
        ),
      ),
    );
    await tester.pumpAndSettle();
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox.shrink());
      container.dispose();
    });
    return container;
  }

  for (final language in ['en', 'ar']) {
    testWidgets(
      'settings action uses platform channel without claiming grant: $language',
      (tester) async {
        await mount(tester, language: language);
        expect(
          find.text(
            language == 'en' ? 'Notification Settings' : 'إعدادات الإشعارات',
          ),
          findsOneWidget,
        );
        expect(find.byType(Switch), findsNothing);
        expect(
          tester
              .widget<Icon>(find.byIcon(Icons.chevron_right))
              .icon!
              .matchTextDirection,
          isTrue,
        );
        await tester.tap(find.byType(ListTile));
        await tester.pumpAndSettle();
        expect(calls.map((call) => call.method), ['open']);
        expect(calls.single.arguments, isNull);
        expect(find.byType(SnackBar), findsNothing);
      },
    );
  }
  testWidgets('unavailable settings shows localized failure and permits retry', (
    tester,
  ) async {
    open = () async => false;
    await mount(tester);
    await tester.tap(find.byType(ListTile));
    await tester.pumpAndSettle();
    expect(
      find.text(
        'Unable to open notification settings. Open the app in your device settings.',
      ),
      findsOneWidget,
    );
    expect(tester.widget<ListTile>(find.byType(ListTile)).onTap, isNotNull);
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
  });
  testWidgets('platform failure clears busy state without success', (
    tester,
  ) async {
    open = () async => throw PlatformException(code: 'unavailable');
    await mount(tester);
    await tester.tap(find.byType(ListTile));
    await tester.pumpAndSettle();
    expect(find.byType(SnackBar), findsOneWidget);
    expect(tester.widget<ListTile>(find.byType(ListTile)).onTap, isNotNull);
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
  });
  testWidgets(
    'pending open is not repeated and stale account gets no feedback',
    (tester) async {
      final result = Completer<bool>();
      open = () => result.future;
      final container = await mount(tester);
      await tester.tap(find.byType(ListTile));
      await tester.pump();
      await tester.tap(find.byType(ListTile));
      expect(calls.length, 1);
      owner = (userId: 'b', revision: 2, locale: 'en');
      container.invalidate(pushOwnerProvider);
      result.complete(false);
      await tester.pumpAndSettle();
      expect(find.byType(SnackBar), findsNothing);
    },
  );
}
