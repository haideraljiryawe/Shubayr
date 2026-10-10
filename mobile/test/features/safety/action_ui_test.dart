import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/widgets/app_button.dart';
import 'package:shubayr/features/auth/data/auth_repository_mock.dart';
import 'package:shubayr/features/auth/data/auth_result.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/profile_update.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/auth/presentation/screens/sign_in_screen.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';
import 'package:shubayr/features/settings/presentation/screens/profile_screen.dart';

class _Auth extends AuthRepositoryMock {
  _Auth() : super(delay: Duration.zero);
  Completer<void>? gate;
  int requests = 0;
  Object? profileFailure;
  @override
  Future<AuthResult> verifyOtp({
    required String phone,
    required String code,
  }) async => const AuthResult(
    accessToken: 'secret',
    user: User(id: 'A', role: 'customer'),
  );
  @override
  Future<void> requestOtp(String phone) async {
    requests++;
    await gate?.future;
  }

  @override
  Future<User> updateProfile(ProfileUpdate update) async {
    if (profileFailure != null) throw profileFailure!;
    return const User(
      id: 'A',
      role: 'customer',
      name: 'New',
      email: 'new@example.com',
    );
  }
}

void main() {
  late ProviderContainer c;
  late _Auth repo;
  setUp(() async {
    repo = _Auth();
    c = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        dataSourceProvider.overrideWithValue(DataSource.mock),
        authRepositoryProvider.overrideWithValue(repo),
        tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
        brandProvider.overrideWithValue(const Brand.bundled()),
      ],
    );
    addTearDown(c.dispose);
    await c.read(sessionControllerProvider.future);
  });
  Widget host(Widget home, {String locale = 'en', bool dark = false}) =>
      UncontrolledProviderScope(
        container: c,
        child: MaterialApp(
          locale: Locale(locale),
          theme: dark
              ? AppTheme.dark(const Brand.bundled())
              : AppTheme.light(const Brand.bundled()),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: home,
        ),
      );

  testWidgets(
    'keyboard and retained button callback cannot duplicate OTP, unexpected failure releases busy',
    (tester) async {
      repo.gate = Completer<void>();
      await tester.pumpWidget(host(const SignInScreen()));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), '07700000000');
      final submit = tester
          .widget<AppButton>(find.byType(AppButton))
          .onPressed!;
      await tester.testTextInput.receiveAction(TextInputAction.done);
      submit();
      await tester.pump();
      expect(repo.requests, 1);
      repo.gate!.completeError(StateError('private-error'));
      await tester.pumpAndSettle();
      final l = AppLocalizations.of(tester.element(find.byType(SignInScreen)));
      expect(find.text(l.errorUnknown), findsOneWidget);
      expect(find.textContaining('private-error'), findsNothing);
      expect(
        tester.widget<AppButton>(find.byType(AppButton)).isLoading,
        isFalse,
      );
      repo.gate = Completer<void>();
      submit();
      await tester.pump();
      expect(repo.requests, 2);
      repo.gate!.completeError(const AppFailure.network());
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );

  for (final language in ['en', 'ar']) {
    testWidgets(
      'stable profile field error is localized and clears after edit ($language)',
      (tester) async {
        await tester.runAsync(
          () => c
              .read(sessionControllerProvider.notifier)
              .verifyOtp(phone: '07700000000', code: '123456'),
        );
        repo.profileFailure = const AppFailure(
          FailureKind.validation,
          errors: [
            ApiFieldError(
              field: 'email',
              message: 'raw private server message',
            ),
          ],
        );
        await tester.pumpWidget(
          host(const ProfileScreen(), locale: language, dark: language == 'ar'),
        );
        await tester.pumpAndSettle();
        final field = find.byKey(const ValueKey('profile-email'));
        await tester.enterText(field, 'new@example.com');
        await tester.testTextInput.receiveAction(TextInputAction.done);
        await tester.pumpAndSettle();
        final l = AppLocalizations.of(
          tester.element(find.byType(ProfileScreen)),
        );
        expect(
          tester
              .widget<TextField>(
                find.descendant(of: field, matching: find.byType(TextField)),
              )
              .decoration
              ?.errorText,
          l.profileEmailInvalid,
        );
        expect(find.textContaining('raw private'), findsNothing);
        await tester.enterText(field, 'another@example.com');
        await tester.pump();
        expect(
          tester
              .widget<TextField>(
                find.descendant(of: field, matching: find.byType(TextField)),
              )
              .decoration
              ?.errorText,
          isNull,
        );
        repo.profileFailure = StateError('private-error');
        await tester.testTextInput.receiveAction(TextInputAction.done);
        await tester.pumpAndSettle();
        expect(find.text(l.errorUnknown), findsOneWidget);
        expect(tester.widget<TextFormField>(field).enabled, isTrue);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
