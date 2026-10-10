import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shubayr/app/shell/customer_bottom_navigation.dart';
import 'package:shubayr/app/shell/customer_branch_transition.dart';
import 'package:shubayr/app/shell/customer_shell.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';

const _paths = ['/home', '/categories', '/cart', '/orders', '/account'];
const _customer = Session.signedIn(User(id: 'customer', role: 'customer'));

class _Session extends SessionController {
  _Session(this.initial);
  final Session initial;
  @override
  Future<Session> build() async => initial;
  void change(Session value) => state = AsyncData(value);
}

class _Cart extends CartController {
  @override
  Future<Cart> build() async => const Cart(items: []);
}

class _Page extends StatefulWidget {
  const _Page({required this.index});
  final int index;
  @override
  State<_Page> createState() => _PageState();
}

class _PageState extends State<_Page> {
  final scroll = ScrollController();
  final filter = TextEditingController();
  final loadedData = Object();
  @override
  void dispose() {
    scroll.dispose();
    filter.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Material(
    child: Column(
      children: [
        TextField(controller: filter),
        Expanded(
          child: ListView.builder(
            controller: scroll,
            itemCount: 100,
            itemExtent: 60,
            itemBuilder: (_, index) => Text('${widget.index}:$index'),
          ),
        ),
      ],
    ),
  );
}

final _tabs = find.descendant(
  of: find.byType(CustomerBottomNavigation),
  matching: find.byType(InkWell),
);
Finder _slide(int index) => find.byKey(ValueKey('bottom-page-slide-$index'));
Offset _offset(WidgetTester tester, int index) =>
    tester.widget<SlideTransition>(_slide(index)).position.value;
int _visibleSlides() => find
    .byWidgetPredicate(
      (widget) =>
          widget is SlideTransition &&
          widget.key.toString().contains('bottom-page-slide-'),
    )
    .evaluate()
    .length;

Future<({GoRouter router, _Session session})> _pump(
  WidgetTester tester, {
  bool rtl = false,
  bool signedIn = true,
  bool disableAnimations = false,
  bool accessibleNavigation = false,
}) async {
  final session = _Session(signedIn ? _customer : const Session.signedOut());
  final container = ProviderContainer(
    overrides: [
      sessionControllerProvider.overrideWith(() => session),
      cartControllerProvider.overrideWith(_Cart.new),
    ],
  );
  final router = GoRouter(
    initialLocation: '/home',
    routes: [
      StatefulShellRoute(
        navigatorContainerBuilder: CustomerBranchTransition.containerBuilder,
        builder: (_, _, shell) => CustomerShell(navigationShell: shell),
        branches: [
          for (var index = 0; index < _paths.length; index++)
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: _paths[index],
                  builder: (_, _) => _Page(index: index),
                  routes: [
                    GoRoute(
                      path: 'detail',
                      builder: (_, _) => Text('Detail $index'),
                    ),
                  ],
                ),
              ],
            ),
        ],
      ),
    ],
  );
  addTearDown(router.dispose);
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(
        theme: AppTheme.light(const Brand.bundled()),
        locale: Locale(rtl ? 'ar' : 'en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        routerConfig: router,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            disableAnimations: disableAnimations,
            accessibleNavigation: accessibleNavigation,
          ),
          child: child!,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return (router: router, session: session);
}

void main() {
  for (final rtl in [false, true]) {
    for (final signedIn in [false, true]) {
      testWidgets(
        'visual direction and direct jump rtl=$rtl signedIn=$signedIn',
        (tester) async {
          final harness = await _pump(tester, rtl: rtl, signedIn: signedIn);
          final homeX = tester.getCenter(_tabs.first).dx;
          final accountX = tester.getCenter(_tabs.last).dx;
          final sign = (accountX - homeX).sign;
          await tester.tap(_tabs.last);
          await tester.pump();
          expect(_offset(tester, 4).dx, closeTo(sign * .22, .001));
          expect(_offset(tester, 0), Offset.zero);
          expect(_visibleSlides(), 2);
          await tester.pump(const Duration(milliseconds: 120));
          final progress = Curves.easeOutCubic.transform(.5);
          expect(
            _offset(tester, 4).dx,
            closeTo(sign * .22 * (1 - progress), .001),
          );
          expect(_offset(tester, 0).dx, closeTo(-sign * .10 * progress, .001));
          await tester.pump(const Duration(milliseconds: 120));
          await tester.pump(const Duration(milliseconds: 1));
          expect(_visibleSlides(), 1);
          expect(_offset(tester, 4), Offset.zero);
          expect(
            harness.router.routeInformationProvider.value.uri.path,
            '/account',
          );
          await tester.tap(_tabs.at(1));
          await tester.pump();
          expect(_offset(tester, 1).dx, closeTo(-sign * .22, .001));
          await tester.pumpAndSettle();
          expect(_visibleSlides(), 1);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets(
    'rapid switches use latest destination and reselection does not slide',
    (tester) async {
      final harness = await _pump(tester);
      for (final index in [1, 2, 4, 0, 3, 1]) {
        await tester.tap(_tabs.at(index));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 30));
        expect(_visibleSlides(), 2);
        expect(
          tester
              .widget<StatefulNavigationShell>(
                find.byType(StatefulNavigationShell),
              )
              .currentIndex,
          index,
        );
        expect(tester.takeException(), isNull);
      }
      await tester.pumpAndSettle();
      expect(_offset(tester, 1), Offset.zero);
      expect(_visibleSlides(), 1);
      harness.router.go('/categories/detail');
      await tester.pumpAndSettle();
      await tester.tap(_tabs.at(1));
      await tester.pump();
      expect(_offset(tester, 1), Offset.zero);
      expect(_visibleSlides(), 1);
      await tester.pumpAndSettle();
      expect(
        harness.router.routeInformationProvider.value.uri.path,
        '/categories',
      );
    },
  );

  testWidgets(
    'branch state, scroll, filter, loaded data and nested history survive',
    (tester) async {
      final harness = await _pump(tester);
      final home = tester.state<_PageState>(find.byType(_Page));
      final loadedData = home.loadedData;
      home.scroll.jumpTo(240);
      home.filter.text = 'saved filter';
      await tester.tap(_tabs.at(1));
      await tester.pumpAndSettle();
      final categories = tester.state<_PageState>(find.byType(_Page));
      harness.router.push<void>('/categories/detail');
      await tester.pumpAndSettle();
      expect(_offset(tester, 1), Offset.zero);
      await tester.tap(_tabs.at(2));
      await tester.pumpAndSettle();
      await tester.tap(_tabs.first);
      await tester.pumpAndSettle();
      expect(tester.state<_PageState>(find.byType(_Page)), same(home));
      expect(home.scroll.offset, 240);
      expect(home.filter.text, 'saved filter');
      expect(home.loadedData, same(loadedData));
      await tester.tap(_tabs.at(1));
      await tester.pumpAndSettle();
      expect(find.text('Detail 1'), findsOneWidget);
      expect(harness.router.canPop(), isTrue);
      harness.router.pop();
      await tester.pump();
      expect(_offset(tester, 1), Offset.zero);
      await tester.pumpAndSettle();
      expect(tester.state<_PageState>(find.byType(_Page)), same(categories));
      harness.router.go('/orders');
      await tester.pump();
      expect(_visibleSlides(), 1);
      expect(_offset(tester, 3), Offset.zero);
      await tester.pumpAndSettle();
    },
  );

  for (final accessible in [false, true]) {
    testWidgets(
      'reduced motion skips the branch slide accessible=$accessible',
      (tester) async {
        await _pump(
          tester,
          disableAnimations: !accessible,
          accessibleNavigation: accessible,
        );
        await tester.tap(_tabs.last);
        await tester.pump();
        expect(_visibleSlides(), 1);
        expect(_offset(tester, 4), Offset.zero);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'session changes settle transition without replacing branch states',
    (tester) async {
      final harness = await _pump(tester);
      final shell = tester.state(find.byType(StatefulNavigationShell));
      await tester.tap(_tabs.last);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 80));
      harness.session.change(const Session.signedOut());
      await tester.pump();
      expect(_tabs, findsNWidgets(3));
      expect(_visibleSlides(), 1);
      expect(_offset(tester, 4), Offset.zero);
      harness.session.change(_customer);
      await tester.pumpAndSettle();
      expect(_tabs, findsNWidgets(5));
      expect(tester.state(find.byType(StatefulNavigationShell)), same(shell));
      expect(tester.takeException(), isNull);
    },
  );
}
