import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/widgets/app_button.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/settings/presentation/screens/profile_screen.dart';
import '../auth/profile_session_test.dart' show start;
import '../auth/support/profile_fakes.dart';

Widget host(
  ProviderContainer container, {
  String locale = 'en',
  bool dark = false,
  double scale = 1,
  TargetPlatform? platform,
}) => UncontrolledProviderScope(
  container: container,
  child: MaterialApp(
    locale: Locale(locale),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme:
        (dark
                ? AppTheme.dark(const Brand.bundled())
                : AppTheme.light(const Brand.bundled()))
            .copyWith(platform: platform),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: TextScaler.linear(scale)),
      child: child!,
    ),
    home: const ProfileScreen(),
  ),
);
final name = find.byKey(const ValueKey('profile-name'));
final email = find.byKey(const ValueKey('profile-email'));
Future<void> save(WidgetTester tester) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.pumpAndSettle();
  final button = find.widgetWithText(AppButton, 'Save');
  await tester.ensureVisible(button);
  await tester.tap(button);
  await tester.pumpAndSettle();
}

void main() {
  for (final device in [
    (platform: TargetPlatform.android, bottom: 48.0),
    (platform: TargetPlatform.android, bottom: 24.0),
    (platform: TargetPlatform.iOS, bottom: 34.0),
  ]) {
    testWidgets('profile save clears system UI and keyboard $device', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(320, 568);
      tester.view.viewPadding = FakeViewPadding(top: 24, bottom: device.bottom);
      tester.view.padding = FakeViewPadding(top: 24, bottom: device.bottom);
      addTearDown(tester.view.reset);
      final repo = RecordingProfile();
      final container = (await tester.runAsync(() => start(repo)))!;
      addTearDown(container.dispose);
      await tester.pumpWidget(host(container, platform: device.platform));
      await tester.pumpAndSettle();
      await tester.ensureVisible(name);
      await tester.enterText(name, 'Changed');
      final action = find.widgetWithText(AppButton, 'Save');
      for (final keyboard in [0.0, 180.0, 0.0]) {
        tester.view.viewInsets = FakeViewPadding(bottom: keyboard);
        tester.view.padding = FakeViewPadding(
          top: 24,
          bottom: keyboard == 0 ? device.bottom : 0,
        );
        await tester.pumpAndSettle();
        await tester.drag(
          find.byType(SingleChildScrollView),
          const Offset(0, -2000),
        );
        await tester.pumpAndSettle();
        final rect = tester.getRect(action);
        expect(
          rect.bottom,
          closeTo(568 - (keyboard > 0 ? keyboard : device.bottom) - 16, .01),
        );
        expect(
          rect.top,
          greaterThanOrEqualTo(tester.getRect(find.byType(AppBar)).bottom),
        );
        expect(action.hitTestable(), findsOneWidget);
        expect(tester.takeException(), isNull);
      }
      await tester.tap(action);
      await tester.pumpAndSettle();
      expect(repo.writes.single, {'name': 'Changed'});
    });
  }

  setUpAll(() async {
    await (FontLoader('Zain')
          ..addFont(rootBundle.load('assets/fonts/Zain-Regular.ttf'))
          ..addFont(rootBundle.load('assets/fonts/Zain-Bold.ttf'))
          ..addFont(rootBundle.load('assets/fonts/Zain-ExtraBold.ttf')))
        .load();
  });
  testWidgets(
    'failure keeps drafts and retry saves, reloads and clears only email',
    (tester) async {
      final repo = RecordingProfile();
      final container = (await tester.runAsync(() => start(repo)))!;
      addTearDown(container.dispose);
      await tester.pumpWidget(host(container));
      await tester.pumpAndSettle();
      await tester.enterText(name, ' أحمد ');
      await tester.enterText(email, ' ali@example.com ');
      repo.onUpdate = (_) async => throw const AppFailure.network();
      await save(tester);
      expect(find.text(' أحمد '), findsOneWidget);
      expect(find.text(' ali@example.com '), findsOneWidget);
      expect(
        container.read(sessionControllerProvider).requireValue.user!.name,
        isNull,
      );
      expect(find.text('Changes saved.'), findsNothing);
      expect(
        tester
            .widget<AppButton>(find.widgetWithText(AppButton, 'Save'))
            .onPressed,
        isNotNull,
      );
      repo.onUpdate = null;
      await save(tester);
      expect(repo.writes.last, {'name': 'أحمد', 'email': 'ali@example.com'});
      expect(
        container.read(sessionControllerProvider).requireValue.user!.email,
        'ali@example.com',
      );
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpWidget(host(container));
      await tester.pumpAndSettle();
      expect(find.text('ali@example.com'), findsOneWidget);
      await tester.enterText(email, '');
      await save(tester);
      expect(repo.writes.last, {'email': null});
      expect(
        container.read(sessionControllerProvider).requireValue.user!.name,
        'أحمد',
      );
      expect(
        container.read(sessionControllerProvider).requireValue.user!.email,
        isNull,
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'invalid input blocks writes; email-only edit works without a name',
    (tester) async {
      final repo = RecordingProfile();
      final container = (await tester.runAsync(() => start(repo)))!;
      addTearDown(container.dispose);
      await tester.pumpWidget(host(container));
      await tester.pumpAndSettle();
      await tester.enterText(email, 'invalid');
      await save(tester);
      expect(repo.writes, isEmpty);
      expect(
        find.text('Enter a valid email, up to 160 characters.'),
        findsOneWidget,
      );
      await tester.enterText(email, 'valid@example.com');
      await save(tester);
      expect(repo.writes.single, {'email': 'valid@example.com'});
      await tester.enterText(name, 'x' * 121);
      await save(tester);
      expect(repo.writes, hasLength(1));
      expect(find.text('Use no more than 120 characters.'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'pending save locks editing and uses authoritative server values',
    (tester) async {
      final repo = RecordingProfile();
      final container = (await tester.runAsync(() => start(repo)))!;
      addTearDown(container.dispose);
      final response = Completer<User>();
      repo.onUpdate = (_) => response.future;
      await tester.pumpWidget(host(container));
      await tester.pumpAndSettle();
      await tester.enterText(name, 'Draft');
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(AppButton, 'Save'));
      await tester.pump();
      expect(tester.widget<TextFormField>(name).enabled, isFalse);
      expect(
        container.read(sessionControllerProvider).requireValue.user!.name,
        isNull,
      );
      response.complete(
        container
            .read(sessionControllerProvider)
            .requireValue
            .user!
            .copyWith(name: 'Saved name'),
      );
      await tester.pumpAndSettle();
      expect(find.text('Saved name'), findsOneWidget);
      expect(
        tester
            .widget<AppButton>(find.widgetWithText(AppButton, 'Save'))
            .onPressed,
        isNull,
      );
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  for (final locale in ['ar', 'en']) {
    for (final dark in [false, true]) {
      testWidgets(
        'profile fields and validation survive responsive resize $locale dark=$dark',
        (tester) async {
          final repo = RecordingProfile();
          final container = (await tester.runAsync(() => start(repo)))!;
          addTearDown(container.dispose);
          addTearDown(() => tester.binding.setSurfaceSize(null));
          await tester.binding.setSurfaceSize(const Size(390, 1000));
          await tester.pumpWidget(
            host(container, locale: locale, dark: dark, scale: 2),
          );
          await tester.pumpAndSettle();
          await tester.enterText(name, 'أحمد Ahmed');
          await tester.enterText(email, 'invalid');
          final form = tester.state<FormState>(find.byType(Form));
          expect(form.validate(), isFalse);
          await tester.pump();
          for (final width in [
            390.0,
            599.0,
            600.0,
            899.0,
            900.0,
            1199.0,
            1200.0,
            1535.0,
            1536.0,
            1920.0,
          ]) {
            await tester.binding.setSurfaceSize(Size(width, 1000));
            await tester.pump();
            expect(find.text('أحمد Ahmed'), findsOneWidget);
            expect(find.text('invalid'), findsOneWidget);
            expect(tester.state<FormState>(find.byType(Form)), same(form));
            expect(tester.takeException(), isNull);
          }
          await tester.pumpWidget(const SizedBox.shrink());
        },
      );
    }
  }
}
