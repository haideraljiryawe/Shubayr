import 'package:shubayr/features/delivery/presentation/delivery_status.dart';
import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/delivery/data/delivery.dart';
import 'package:shubayr/features/delivery/data/delivery_detail.dart';
import 'package:shubayr/features/delivery/data/delivery_repository_remote.dart';
import 'package:shubayr/features/delivery/presentation/providers/delivery_providers.dart';
import 'package:shubayr/features/delivery/presentation/screens/delivery_detail_screen.dart';
import 'package:shubayr/features/delivery/presentation/screens/delivery_home_screen.dart';
import 'package:shubayr/features/delivery/presentation/widgets/delivery_collection_summary.dart';
import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';
import 'package:shubayr/features/settings/presentation/providers/privacy_policy_provider.dart';
import 'support/delivery_fakes.dart';

Map<String, dynamic> detailJson({String status = 'assigned'}) => {
  'id': 'd0',
  'order_id': 'order-0',
  'order_number': 'ORD-2026-A1',
  'order_version': 1,
  'status': status,
  'currency': 'IQD',
  'amount_due': 25500,
  'recipient_name': 'Recipient only',
  'recipient_phone': '07701234567',
  'shipping_address': {
    'label': 'Home',
    'city': 'Baghdad',
    'area': 'Area',
    'street': 'A long street name that should wrap on phones',
    'details': 'Near the corner',
    'lat': 33.3,
    'lng': 44.3,
  },
  'items': [
    {
      'id': 'line',
      'product_name_ar': 'قهوة عربية ذات اسم طويل',
      'product_name_en': 'Coffee with a long historical product name',
      'variant_id': 'sku-id',
      'variant_sku': 'COFFEE-1',
      'variant_attributes': {'Size': 'Large'},
      'quantity': .125,
      'base_unit': 'kg',
      'whole_units_only': false,
      'unit_price': 20000,
      'line_total': 2500,
      'currency': 'IQD',
    },
  ],
};

class Details extends RecordingDeliveries {
  int detailReads = 0;
  Future<DeliveryDetail> Function()? read;
  @override
  Future<DeliveryDetail> fetchDetail(String id) {
    detailReads++;
    return read?.call() ?? Future.value(DeliveryDetail.fromJson(detailJson()));
  }
}

Future<ProviderContainer> container(Details repo) async {
  final c = ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      sessionControllerProvider.overrideWith(DeliveryTestSession.new),
      deliveryRepositoryProvider.overrideWithValue(repo),
      brandProvider.overrideWithValue(const Brand.bundled()),
      notificationSyncProvider.overrideWith((ref) {}),
      unreadCountProvider.overrideWith((ref) async => 0),
    ],
  );
  await c.read(sessionControllerProvider.future);
  return c;
}

Widget host(
  ProviderContainer c,
  Widget child, {
  String lang = 'en',
  bool dark = false,
}) => UncontrolledProviderScope(
  container: c,
  child: MaterialApp(
    locale: Locale(lang),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: dark
        ? AppTheme.dark(const Brand.bundled())
        : AppTheme.light(const Brand.bundled()),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: const TextScaler.linear(1.5)),
      child: child!,
    ),
    home: child,
  ),
);
void main() {
  test(
    'delivery conflicts retain actionable accounting and fare feedback',
    () async {
      final l = await AppLocalizations.delegate.load(const Locale('en'));
      expect(
        deliveryErrorLabel(
          l,
          const AppFailure(
            FailureKind.conflict,
            statusCode: 409,
            code: 'PERIOD_CLOSED',
          ),
        ),
        l.deliveryPeriodClosed,
      );
      expect(
        deliveryErrorLabel(
          l,
          const AppFailure(
            FailureKind.conflict,
            statusCode: 409,
            code: 'TRIP_FARE_SHARE_MISMATCH',
          ),
        ),
        l.deliveryFareMismatch,
      );
      expect(
        deliveryErrorLabel(
          l,
          const AppFailure(FailureKind.conflict, statusCode: 409),
        ),
        l.deliveryStatusConflict,
      );
    },
  );
  test(
    'remote detail uses delivery endpoint, rejects mismatched responses, no list reads',
    () async {
      final paths = <String>[];
      var mismatch = false;
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (r, h) {
              paths.add(r.path);
              h.resolve(
                Response(
                  requestOptions: r,
                  data: {...detailJson(), if (mismatch) 'id': 'another'},
                ),
              );
            },
          ),
        );
      final repo = DeliveryRepositoryRemote(ApiClient(dio));
      final detail = await repo.fetchDetail('d0');
      expect(paths, ['/deliveries/d0']);
      expect(detail.items.single.quantity, .125);
      expect(detail.orderNumber, 'ORD-2026-A1');
      expect(detail.items.single.lineTotal, 2500);
      mismatch = true;
      await expectLater(repo.fetchDetail('d0'), throwsA(isA<AppFailure>()));
    },
  );
  test(
    'terminal payloads discard contacts and coordinates; collection null stays unknown',
    () {
      for (final state in ['delivered', 'returned']) {
        final detail = DeliveryDetail.fromJson(detailJson(status: state));
        expect(detail.recipientName, isNull);
        expect(detail.recipientPhone, isNull);
        expect(detail.shippingAddress, isNull);
      }
      final delivery = Delivery.fromJson({
        'id': 'd0',
        'order_id': 'o',
        'order_version': 1,
        'status': 'delivered',
        'amount_due': 25500,
        'collection': null,
      });
      expect(delivery.collection, isNull);
    },
  );
  test('late detail read cannot leak into another agent session', () async {
    final first = Completer<DeliveryDetail>();
    final second = Completer<DeliveryDetail>();
    final repo = Details();
    repo.read = () => repo.detailReads == 1 ? first.future : second.future;
    final c = await container(repo);
    addTearDown(c.dispose);
    final sub = c.listen(deliveryDetailProvider('d0'), (_, _) {});
    addTearDown(sub.close);
    await Future<void>.delayed(Duration.zero);
    (c.read(sessionControllerProvider.notifier) as DeliveryTestSession)
        .setSession(
          const Session.signedIn(
            User(id: 'another-agent', role: 'delivery_agent'),
          ),
        );
    await Future<void>.delayed(Duration.zero);
    first.complete(DeliveryDetail.fromJson(detailJson()));
    await Future<void>.delayed(Duration.zero);
    expect(c.read(deliveryDetailProvider('d0')).asData, isNull);
    second.complete(
      DeliveryDetail.fromJson({
        ...detailJson(),
        'recipient_name': 'Second recipient',
      }),
    );
    expect(
      (await c.read(deliveryDetailProvider('d0').future)).recipientName,
      'Second recipient',
    );
  });
  test('customer identity cannot request agent detail', () async {
    final repo = Details();
    final c = await container(repo);
    addTearDown(c.dispose);
    (c.read(sessionControllerProvider.notifier) as DeliveryTestSession)
        .setSession(const Session.signedIn(User(id: 'c', role: 'customer')));
    await expectLater(
      c.read(deliveryDetailProvider('d0').future),
      throwsA(isA<AppFailure>()),
    );
    expect(repo.detailReads, 0);
  });
  testWidgets(
    'opening from a list requests details once without another list request',
    (tester) async {
      final repo = Details()
        ..onFetch = ((r) => Future.value(deliveryPage(r, total: 1)));
      final c = await container(repo);
      addTearDown(c.dispose);
      final router = GoRouter(
        initialLocation: '/delivery',
        routes: [
          GoRoute(
            path: '/delivery',
            builder: (_, _) => const DeliveryHomeScreen(),
          ),
          GoRoute(
            path: '/delivery/:id',
            builder: (_, s) => DeliveryDetailScreen(
              deliveryId: s.pathParameters['id']!,
              fromList: s.extra == true,
            ),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: MaterialApp.router(
            routerConfig: router,
            theme: AppTheme.light(const Brand.bundled()),
            locale: const Locale('en'),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(repo.detailReads, 0);
      expect(repo.requests.length, 1);
      await tester.ensureVisible(find.text('View details'));
      await tester.tap(find.text('View details'));
      await tester.pumpAndSettle();
      expect(repo.detailReads, 1);
      expect(repo.requests.length, 1);
      expect(find.text('ORD-2026-A1'), findsOneWidget);
      router.pop();
      await tester.pumpAndSettle();
      expect(repo.detailReads, 1);
    },
  );
  testWidgets('reassignment read clears already visible contact data', (
    tester,
  ) async {
    final repo = Details();
    final c = await container(repo);
    addTearDown(c.dispose);
    await tester.pumpWidget(
      host(c, const DeliveryDetailScreen(deliveryId: 'd0')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Recipient only'), findsOneWidget);
    expect(repo.requests, isEmpty);
    repo.read = () =>
        throw const AppFailure(FailureKind.notFound, statusCode: 404);
    c.invalidate(deliveryDetailProvider('d0'));
    await tester.pumpAndSettle();
    expect(find.text('Recipient only'), findsNothing);
    expect(find.text('Delivery no longer available'), findsOneWidget);
  });
  for (final lang in ['ar', 'en']) {
    for (final width in [320.0, 600.0, 900.0, 1200.0, 1920.0]) {
      testWidgets(
        'detail fits $lang $width with enlarged text and historical amounts',
        (tester) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = Size(width, 900);
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final c = await container(Details());
          addTearDown(c.dispose);
          await tester.pumpWidget(
            host(
              c,
              Scaffold(
                body: SingleChildScrollView(
                  child: DeliveryDetailContent(
                    detail: DeliveryDetail.fromJson(detailJson()),
                  ),
                ),
              ),
              lang: lang,
              dark: lang == 'ar',
            ),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          expect(find.textContaining('0.125 kg'), findsOneWidget);
          final l = AppLocalizations.of(
            tester.element(find.byType(DeliveryDetailContent)),
          );
          expect(find.text(l.deliveryTotalNotBalance), findsOneWidget);
        },
      );
    }
  }
  testWidgets(
    'unconfirmed collection never displays an invented zero; confirmed short is a record',
    (tester) async {
      final c = await container(Details());
      addTearDown(c.dispose);
      await tester.pumpWidget(
        host(
          c,
          const Scaffold(
            body: DeliveryCollectionSummary(
              collection: DeliveryCollection(
                status: 'unconfirmed',
                dueAmount: 20000,
                currency: 'IQD',
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Recorded store collection:'), findsNothing);
      await tester.pumpWidget(
        host(
          c,
          const Scaffold(
            body: DeliveryCollectionSummary(
              collection: DeliveryCollection(
                status: 'confirmed_short',
                dueAmount: 20000,
                collectedAmount: 15000,
                shortfallAmount: 5000,
                currency: 'IQD',
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('15,000'), findsOneWidget);
      expect(find.textContaining('5,000'), findsNWidgets(2));
      expect(
        find.text(
          'This record is not an instruction to collect additional money.',
        ),
        findsOneWidget,
      );
    },
  );
  for (final phone in ['+9647701234567', '07701234567']) {
    testWidgets(
      'call uses canonical delivery contact without guessing a country: $phone',
      (tester) async {
        Uri? opened;
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              externalLinkLauncherProvider.overrideWithValue((uri) async {
                opened = uri;
                return true;
              }),
            ],
            child: MaterialApp(
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              locale: const Locale('en'),
              home: Scaffold(
                body: SingleChildScrollView(
                  child: DeliveryDetailContent(
                    detail: DeliveryDetail.fromJson({
                      ...detailJson(),
                      'recipient_phone': phone,
                    }),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        if (phone.startsWith('+')) {
          expect(find.text('+964 770 123 4567'), findsOneWidget);
          await tester.tap(find.text('Call recipient'));
          await tester.pumpAndSettle();
          expect(opened.toString(), 'tel:+9647701234567');
        } else {
          expect(find.text(phone), findsOneWidget);
          expect(find.text('Call recipient'), findsNothing);
          expect(opened, isNull);
        }
      },
    );
  }
}
