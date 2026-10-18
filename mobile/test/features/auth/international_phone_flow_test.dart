import 'package:country_picker/country_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/widgets/app_button.dart';
import 'package:shubayr/core/widgets/international_phone_field.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/auth/presentation/screens/sign_in_screen.dart';
import 'package:shubayr/features/auth/presentation/screens/verify_otp_screen.dart';

class _Session extends SessionController {
  final requested = <String>[];
  final verified = <String>[];
  @override
  Future<Session> build() async => const Session.signedOut();
  @override
  Future<void> requestOtp(String phone) async {
    requested.add(phone);
  }

  @override
  Future<Session?> verifyOtp({
    required String phone,
    required String code,
  }) async {
    verified.add(phone);
    return null;
  }
}

void main() {
  for (final language in ['ar', 'en']) {
    testWidgets('local login and OTP preserve canonical phone in $language', (
      tester,
    ) async {
      tester.platformDispatcher.localesTestValue = [const Locale('ar', 'IQ')];
      addTearDown(tester.platformDispatcher.clearLocalesTestValue);
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(320, 800);
      addTearDown(tester.view.reset);
      final session = _Session();
      final router = GoRouter(
        routes: [
          GoRoute(path: '/', builder: (_, _) => const SignInScreen()),
          GoRoute(
            path: '/verify',
            name: AppRoutes.verifyOtpName,
            builder: (_, state) =>
                VerifyOtpScreen(phone: state.uri.queryParameters['phone']!),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [sessionControllerProvider.overrideWith(() => session)],
          child: MaterialApp.router(
            routerConfig: router,
            locale: Locale(language),
            localizationsDelegates: const [
              CountryLocalizations.delegate,
              ...AppLocalizations.localizationsDelegates,
            ],
            supportedLocales: AppLocalizations.supportedLocales,
            theme: AppTheme.light(const Brand.bundled()),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: const TextScaler.linear(1.5)),
              child: child!,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.pumpAndSettle();
      expect(find.text('+964'), findsOneWidget);
      await tester.enterText(find.byType(TextFormField), '٠٧٧٠١٢٣٤٥٦٧');
      await tester.ensureVisible(find.byType(AppButton).first);
      await tester.tap(find.byType(AppButton).first);
      await tester.pumpAndSettle();
      expect(session.requested, ['+9647701234567']);
      final number = tester.widget<SelectableText>(
        find.descendant(
          of: find.byKey(const ValueKey('otp-phone-number')),
          matching: find.byType(SelectableText),
        ),
      );
      expect(number.data, '+964 770 123 4567');
      expect(number.textDirection, TextDirection.ltr);
      await tester.enterText(find.byType(TextFormField), '١٢٣٤٥٦');
      await tester.ensureVisible(find.byType(AppButton).first);
      await tester.tap(find.byType(AppButton).first);
      await tester.pumpAndSettle();
      expect(session.verified, ['+9647701234567']);
      await tester.ensureVisible(find.byType(AppButton).last);
      await tester.tap(find.byType(AppButton).last);
      await tester.pumpAndSettle();
      expect(session.requested, ['+9647701234567', '+9647701234567']);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets(
    'Iraqi national input requires the visible selected country and full paste selects its country',
    (tester) async {
      tester.platformDispatcher.localesTestValue = [const Locale('en', 'US')];
      addTearDown(tester.platformDispatcher.clearLocalesTestValue);
      final form = GlobalKey<FormState>();
      String? saved;
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('en'),
          localizationsDelegates: const [
            CountryLocalizations.delegate,
            ...AppLocalizations.localizationsDelegates,
          ],
          supportedLocales: AppLocalizations.supportedLocales,
          theme: AppTheme.light(const Brand.bundled()),
          home: Scaffold(
            body: Form(
              key: form,
              child: InternationalPhoneField(
                label: 'Phone',
                onSaved: (value) => saved = value,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('+1'), findsOneWidget);
      await tester.enterText(find.byType(TextFormField), '07811100070');
      expect(form.currentState!.validate(), isFalse);
      await tester.tap(find.byKey(const ValueKey('phone-country-selector')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).last, 'Iraq');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Iraq').last);
      await tester.pumpAndSettle();
      for (final input in ['07811100070', '7811100070', '+9647811100070']) {
        await tester.enterText(find.byType(TextFormField), input);
        expect(form.currentState!.validate(), isTrue);
        form.currentState!.save();
        expect(saved, '+9647811100070');
        expect(find.text('+964'), findsOneWidget);
      }
      await tester.enterText(find.byType(TextFormField), '+442079460018');
      await tester.pump();
      expect(find.text('+44'), findsOneWidget);
      expect(
        tester
            .widget<TextFormField>(find.byType(TextFormField))
            .controller!
            .text,
        '2079460018',
      );
      expect(form.currentState!.validate(), isTrue);
      form.currentState!.save();
      expect(saved, '+442079460018');
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('searchable country picker changes local number interpretation', (
    tester,
  ) async {
    tester.platformDispatcher.localesTestValue = [const Locale('en')];
    addTearDown(tester.platformDispatcher.clearLocalesTestValue);
    final form = GlobalKey<FormState>();
    String? saved;
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: const [
          CountryLocalizations.delegate,
          ...AppLocalizations.localizationsDelegates,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        theme: AppTheme.light(const Brand.bundled()),
        home: Scaffold(
          body: Form(
            key: form,
            child: InternationalPhoneField(
              label: 'Phone',
              onSaved: (value) => saved = value,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('+964'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('phone-country-selector')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'United Kingdom');
    await tester.pumpAndSettle();
    await tester.tap(find.text('United Kingdom').last);
    await tester.pumpAndSettle();
    expect(find.text('+44'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField), '020 7946 0018');
    expect(form.currentState!.validate(), isTrue);
    form.currentState!.save();
    expect(saved, '+442079460018');
    expect(tester.takeException(), isNull);
  });
}
