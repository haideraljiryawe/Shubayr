import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/widgets/app_button.dart';
import 'package:shubayr/core/widgets/user_avatar.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/settings/presentation/screens/account_view.dart';
import 'package:shubayr/features/settings/presentation/screens/profile_screen.dart';

class _Session extends SessionController {
  _Session(this.user);
  final User? user;
  @override
  Future<Session> build() async =>
      user == null ? const Session.signedOut() : Session.signedIn(user!);
}

Future<ProviderContainer> _start(User? user) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  final container = ProviderContainer(
    overrides: [
      prefsStoreProvider.overrideWithValue(PrefsStore(prefs)),
      tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
      sessionControllerProvider.overrideWith(() => _Session(user)),
    ],
  );
  await container.read(sessionControllerProvider.future);
  return container;
}

Widget _host(
  ProviderContainer container, {
  String locale = 'en',
  bool dark = false,
  double scale = 1,
  Widget child = const Scaffold(body: AccountView()),
}) => UncontrolledProviderScope(
  container: container,
  child: MaterialApp(
    locale: Locale(locale),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: dark
        ? AppTheme.dark(const Brand.bundled())
        : AppTheme.light(const Brand.bundled()),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: TextScaler.linear(scale)),
      child: child!,
    ),
    home: child,
  ),
);

void main() {
  setUpAll(() async {
    await (FontLoader(
      'Cairo',
    )..addFont(rootBundle.load('assets/fonts/Cairo-Regular.ttf'))).load();
  });

  for (final role in ['customer', 'admin', 'delivery']) {
    for (final locale in ['ar', 'en']) {
      testWidgets('identity and customer links follow session $role $locale', (
        tester,
      ) async {
        final container = (await tester.runAsync(
          () => _start(
            User(
              id: 'u',
              name: 'أحمد Ahmed',
              phone: '07700000000',
              email: 'ahmed@example.com',
              role: role,
            ),
          ),
        ))!;
        addTearDown(container.dispose);
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await tester.binding.setSurfaceSize(const Size(390, 1000));
        await tester.pumpWidget(_host(container, locale: locale));
        await tester.pumpAndSettle();
        final l10n = AppLocalizations.of(
          tester.element(find.byType(AccountView)),
        );
        expect(find.text('أحمد Ahmed'), findsOneWidget);
        expect(find.text('07700000000'), findsOneWidget);
        expect(find.text('ahmed@example.com'), findsOneWidget);
        final roleLabel = role == 'customer'
            ? l10n.roleCustomer
            : role == 'admin'
            ? l10n.roleStaff
            : l10n.roleDelivery;
        expect(find.text(l10n.accountSignedInAs(roleLabel)), findsOneWidget);
        expect(find.byType(TextField), findsNothing);
        expect(
          find.text(l10n.wishlistTitle),
          role == 'customer' ? findsOneWidget : findsNothing,
        );
        expect(
          find.text(l10n.addressesTitle),
          role == 'customer' ? findsOneWidget : findsNothing,
        );
        final summary = find.byKey(const ValueKey('account-summary'));
        final centerX = tester.getCenter(summary).dx;
        for (final element in [
          find.byType(UserAvatar),
          find.text('أحمد Ahmed'),
          find.text('07700000000'),
          find.text('ahmed@example.com'),
          find.text(l10n.accountSignedInAs(roleLabel)),
          find.widgetWithText(AppButton, l10n.accountEditProfile),
        ]) {
          expect(tester.getCenter(element).dx, closeTo(centerX, 0.01));
        }
        for (final label in [
          'أحمد Ahmed',
          '07700000000',
          'ahmed@example.com',
          l10n.accountSignedInAs(roleLabel),
        ]) {
          expect(
            tester.widget<Text>(find.text(label)).textAlign,
            TextAlign.center,
          );
        }
        expect(
          find.descendant(
            of: find.byType(UserAvatar),
            matching: find.byType(Text),
          ),
          findsNothing,
        );
        expect(
          find.descendant(
            of: find.byType(UserAvatar),
            matching: find.byIcon(Icons.person),
          ),
          findsOneWidget,
        );
        await tester.binding.setSurfaceSize(const Size(1200, 1000));
        await tester.pumpAndSettle();
        final avatarBounds = tester.getRect(find.byType(UserAvatar));
        final nameBounds = tester.getRect(find.text('أحمد Ahmed'));
        expect(avatarBounds.bottom, lessThan(nameBounds.top));
        expect(avatarBounds.center.dx, closeTo(nameBounds.center.dx, 0.01));
        expect(find.byType(UserAvatar), findsOneWidget);
        expect(find.byIcon(Icons.photo_camera_outlined), findsNothing);
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }

  for (final locale in ['ar', 'en']) {
    for (final dark in [false, true]) {
      testWidgets('missing identity is explicit and responsive $locale $dark', (
        tester,
      ) async {
        final container = (await tester.runAsync(
          () => _start(
            const User(id: 'u', phone: '07700000000', role: 'customer'),
          ),
        ))!;
        addTearDown(container.dispose);
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await tester.pumpWidget(
          _host(container, locale: locale, dark: dark, scale: 2),
        );
        await tester.pumpAndSettle();
        final l10n = AppLocalizations.of(
          tester.element(find.byType(AccountView)),
        );
        expect(find.text(l10n.accountNoName), findsOneWidget);
        expect(find.text(l10n.accountNoEmail), findsOneWidget);
        for (final width in [
          320.0,
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
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull, reason: 'width=$width');
        }
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }

  for (final locale in ['ar', 'en']) {
    for (final dark in [false, true]) {
      testWidgets('guest identity is intentional and centered $locale $dark', (
        tester,
      ) async {
        final container = (await tester.runAsync(() => _start(null)))!;
        addTearDown(container.dispose);
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await tester.binding.setSurfaceSize(const Size(390, 1000));
        await tester.pumpWidget(
          _host(container, locale: locale, dark: dark, scale: 2),
        );
        await tester.pumpAndSettle();
        final l10n = AppLocalizations.of(
          tester.element(find.byType(AccountView)),
        );
        final summary = find.byKey(const ValueKey('account-guest-summary'));
        expect(find.text(l10n.authGuest), findsOneWidget);
        expect(find.text(l10n.accountGuestPrompt), findsOneWidget);
        expect(find.text(l10n.accountNoName), findsNothing);
        expect(find.text(l10n.accountNoPhone), findsNothing);
        expect(find.text(l10n.accountNoEmail), findsNothing);
        expect(find.byKey(const ValueKey('account-sign-out')), findsNothing);
        expect(find.byKey(const ValueKey('account-delete')), findsNothing);
        expect(find.byIcon(Icons.person), findsOneWidget);
        expect(
          find.descendant(
            of: find.byType(UserAvatar),
            matching: find.byType(Text),
          ),
          findsNothing,
        );
        final centerX = tester.getCenter(summary).dx;
        for (final element in [
          find.byType(UserAvatar),
          find.text(l10n.authGuest),
          find.text(l10n.accountGuestPrompt),
          find.widgetWithText(AppButton, l10n.authSignInTitle),
        ]) {
          expect(tester.getCenter(element).dx, closeTo(centerX, 0.01));
        }
        for (final width in [
          320.0,
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
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull, reason: 'width=$width');
        }
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }

  testWidgets(
    'account actions confirm deletion, profile edits identity, logout clears session',
    (tester) async {
      final container = (await tester.runAsync(
        () => _start(
          const User(
            id: 'u',
            name: 'Ahmed',
            phone: '07700000000',
            role: 'customer',
          ),
        ),
      ))!;
      addTearDown(container.dispose);
      final router = GoRouter(
        initialLocation: '/account',
        routes: [
          GoRoute(
            path: '/account',
            builder: (_, state) => const Scaffold(body: AccountView()),
          ),
          GoRoute(
            path: AppRoutes.profile,
            name: AppRoutes.profileName,
            builder: (_, state) => const ProfileScreen(),
          ),
          GoRoute(
            path: AppRoutes.home,
            builder: (_, state) => const Scaffold(body: Text('Public home')),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(
            routerConfig: router,
            locale: const Locale('en'),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            theme: AppTheme.light(const Brand.bundled()),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final delete = find.byKey(const ValueKey('account-delete'));
      final logout = find.byKey(const ValueKey('account-sign-out'));
      await tester.ensureVisible(delete);
      await tester.pumpAndSettle();
      expect(find.text('Sign out'), findsOneWidget);
      expect(find.text('Delete account'), findsOneWidget);
      expect(
        tester.getTopLeft(delete).dy,
        greaterThan(tester.getTopLeft(logout).dy),
      );
      await tester.tap(delete);
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);
      final deleteConfirmation = find.byKey(const ValueKey('confirm-delete'));
      final acknowledge = find.byKey(const ValueKey('acknowledge-delete'));
      expect(tester.widget<TextButton>(deleteConfirmation).onPressed, isNull);
      expect(tester.widget<CheckboxListTile>(acknowledge).value, isFalse);
      await tester.tap(deleteConfirmation);
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(find.byType(SnackBar), findsNothing);
      await tester.tap(acknowledge);
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextButton>(deleteConfirmation).onPressed,
        isNotNull,
      );
      expect(find.byType(SnackBar), findsNothing);
      await tester.tap(acknowledge);
      await tester.pumpAndSettle();
      expect(tester.widget<TextButton>(deleteConfirmation).onPressed, isNull);
      await tester.tap(acknowledge);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(
        container.read(sessionControllerProvider).requireValue.isSignedIn,
        isTrue,
      );
      await tester.tap(delete);
      await tester.pumpAndSettle();
      expect(tester.widget<CheckboxListTile>(acknowledge).value, isFalse);
      expect(tester.widget<TextButton>(deleteConfirmation).onPressed, isNull);
      await tester.tap(acknowledge);
      await tester.pumpAndSettle();
      await tester.tap(deleteConfirmation);
      await tester.pumpAndSettle();
      expect(find.byType(SnackBar), findsOneWidget);
      expect(
        container.read(sessionControllerProvider).requireValue.isSignedIn,
        isTrue,
      );
      await tester.pump(const Duration(seconds: 4));
      await tester.ensureVisible(find.text('Edit profile'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Edit profile'));
      await tester.pumpAndSettle();
      expect(find.byType(ProfileScreen), findsOneWidget);
      expect(find.byIcon(Icons.logout), findsNothing);
      expect(find.byIcon(Icons.delete_outline), findsNothing);
      expect(find.byType(TextFormField), findsNWidgets(2));
      expect(find.text('07700000000'), findsOneWidget);
      // Exactly one camera belongs to the actual outlined button, never the avatar.
      expect(find.byIcon(Icons.photo_camera_outlined), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(UserAvatar),
          matching: find.byIcon(Icons.photo_camera_outlined),
        ),
        findsNothing,
      );
      final photo = find.widgetWithText(AppButton, 'Change photo');
      expect(
        tester.widget<AppButton>(photo).variant,
        AppButtonVariant.secondary,
      );
      expect(tester.getSize(photo).height, greaterThanOrEqualTo(48));
      await tester.tap(find.byKey(const ValueKey('profile-change-phone')));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('The new number will need OTP verification.'),
        findsOneWidget,
      );
      expect(
        container.read(sessionControllerProvider).requireValue.user!.phone,
        '07700000000',
      );
      await tester.pump(const Duration(seconds: 4));
      router.pop();
      await tester.pumpAndSettle();
      await tester.ensureVisible(logout);
      await tester.pumpAndSettle();
      await tester.tap(logout);
      await tester.pumpAndSettle();
      expect(find.text('Do you want to sign out?'), findsOneWidget);
      expect(
        container.read(sessionControllerProvider).requireValue.isSignedIn,
        isTrue,
      );
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(
        container.read(sessionControllerProvider).requireValue.isSignedIn,
        isTrue,
      );
      expect(find.text('Public home'), findsNothing);
      await tester.tap(logout);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('confirm-sign-out')));
      await tester.pumpAndSettle();
      expect(
        container.read(sessionControllerProvider).requireValue.isSignedIn,
        isFalse,
      );
      expect(find.text('Public home'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
