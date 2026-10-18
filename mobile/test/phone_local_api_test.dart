import 'dart:io';

import 'package:country_picker/country_picker.dart';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/utils/international_phone.dart';
import 'package:shubayr/core/widgets/app_button.dart';
import 'package:shubayr/features/address/data/address.dart';
import 'package:shubayr/features/address/data/address_repository_remote.dart';
import 'package:shubayr/features/auth/data/auth_repository_remote.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/auth/presentation/screens/sign_in_screen.dart';
import 'package:shubayr/features/auth/presentation/screens/verify_otp_screen.dart';

// Explicit opt-in. Requires a throwaway shubayr_*_verify database behind a
// development API on this loopback port, with DEV_OTP=000000 and SMS disabled.
// No response fixtures, fake transport, or production/configurable destination.
class _RealHttpOverrides extends HttpOverrides {}

const _enabled = bool.fromEnvironment('RUN_PHONE_API_INTEGRATION');

void main() {
  for (final input in ['07811100070', '7811100070', '+9647811100070']) {
    testWidgets('real local OTP navigation and address roundtrip: $input', (
      tester,
    ) async {
      tester.platformDispatcher.localesTestValue = [const Locale('ar', 'IQ')];
      addTearDown(tester.platformDispatcher.clearLocalesTestValue);
      final dio = Dio(
        BaseOptions(
          baseUrl: 'http://127.0.0.1:18000/api/v1',
          connectTimeout: const Duration(seconds: 5),
          receiveTimeout: const Duration(seconds: 10),
        ),
      );
      dio.httpClientAdapter = IOHttpClientAdapter(
        createHttpClient: () => _RealHttpOverrides().createHttpClient(null),
      );
      addTearDown(() => dio.close(force: true));
      final api = ApiClient(dio);
      final auth = AuthRepositoryRemote(api);
      final container = ProviderContainer(
        overrides: [
          apiClientProvider.overrideWithValue(api),
          authRepositoryProvider.overrideWithValue(auth),
          tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
        ],
      );
      addTearDown(container.dispose);
      await tester.runAsync(
        () => container.read(sessionControllerProvider.future),
      );
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
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(
            routerConfig: router,
            locale: const Locale('ar'),
            localizationsDelegates: const [
              CountryLocalizations.delegate,
              ...AppLocalizations.localizationsDelegates,
            ],
            supportedLocales: AppLocalizations.supportedLocales,
            theme: AppTheme.light(const Brand.bundled()),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), input);
      await tester.ensureVisible(find.byType(AppButton).first);
      await tester.tap(find.byType(AppButton).first);
      // Network completion is real asynchronous I/O, outside the fake clock.
      for (
        var attempt = 0;
        attempt < 100 && find.byType(VerifyOtpScreen).evaluate().isEmpty;
        attempt++
      ) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 100)),
        );
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(find.byType(VerifyOtpScreen), findsOneWidget);
      const canonical = '+9647811100070';
      expect(
        tester.widget<VerifyOtpScreen>(find.byType(VerifyOtpScreen)).phone,
        canonical,
      );
      expect(find.text(InternationalPhone.display(canonical)), findsOneWidget);
      await tester.runAsync(() async {
        final session = await auth.verifyOtp(phone: canonical, code: '000000');
        dio.options.headers['Authorization'] = 'Bearer ${session.accessToken}';
        expect((await auth.currentUser()).phone, canonical);
        final governorates = await api.get<List<dynamic>>('/governorates');
        expect(governorates, isNotEmpty);
        final governorateId =
            (governorates.first as Map<String, dynamic>)['id'] as String;
        final addresses = AddressRepositoryRemote(api);
        final created = await addresses.createAddress(
          AddressInput(
            city: 'Baghdad',
            governorateId: governorateId,
            contactPhone: canonical,
          ),
        );
        try {
          expect(created.contactPhone, canonical);
          final updated = await addresses.updateAddress(
            created.id,
            AddressInput(
              city: 'Baghdad',
              governorateId: governorateId,
              contactPhone: '+442079460018',
              isDefault: created.isDefault,
            ),
          );
          expect(updated.contactPhone, '+442079460018');
          final reread = await addresses.fetchAddresses();
          expect(
            reread.data
                .singleWhere((item) => item.id == created.id)
                .contactPhone,
            '+442079460018',
          );
        } finally {
          await addresses.deleteAddress(created.id);
        }
      });
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    }, skip: !_enabled);
  }
}
