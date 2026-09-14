import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/permissions.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/domain/user_role.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/auth/presentation/widgets/permission_gate.dart';

Future<ProviderContainer> _container() async {
  SharedPreferences.setMockInitialValues({});
  final prefs = PrefsStore(await SharedPreferences.getInstance());
  return ProviderContainer(
    retry: (retryCount, error) => null,
    overrides: [
      prefsStoreProvider.overrideWithValue(prefs),
      tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
    ],
  );
}

Future<Session> _signIn(ProviderContainer c, String phone) async {
  await c.read(sessionControllerProvider.future);
  await c
      .read(sessionControllerProvider.notifier)
      .verifyOtp(phone: phone, code: '123456');
  return c.read(sessionControllerProvider).requireValue;
}

void main() {
  test('User.fromJson reads permissions and defaults to empty', () {
    final withPerms = User.fromJson({
      'id': 'u1',
      'role': 'manager',
      'permissions': ['orders.view', 'catalog.manage'],
    });
    expect(withPerms.permissions, ['orders.view', 'catalog.manage']);

    final without = User.fromJson({'id': 'u2', 'role': 'customer'});
    expect(without.permissions, isEmpty);
  });

  test('Session.can reflects the granted permissions', () {
    const session = Session.signedIn(
      User(id: 'u', role: 'manager', permissions: ['orders.confirm']),
    );
    expect(session.can('orders.confirm'), isTrue);
    expect(session.can('users.manage'), isFalse);
  });

  test('mock admin sign-in grants the full permission set', () async {
    final c = await _container();
    addTearDown(c.dispose);
    // The mock maps a phone ending in 2 to the admin role.
    final session = await _signIn(c, '07700000002');

    expect(session.role, UserRole.staff);
    expect(session.can(Permissions.usersManage), isTrue);
    expect(session.can(Permissions.settingsManage), isTrue);
    expect(session.permissions.length, Permissions.all.length);
  });

  test('mock delivery sign-in grants only delivery permissions', () async {
    final c = await _container();
    addTearDown(c.dispose);
    final session = await _signIn(c, '07700000001'); // ends in 1 -> delivery

    expect(session.role, UserRole.delivery);
    expect(session.can(Permissions.deliveryAssigned), isTrue);
    expect(session.can(Permissions.usersManage), isFalse);
  });

  test('mock customer sign-in grants no permissions', () async {
    final c = await _container();
    addTearDown(c.dispose);
    final session = await _signIn(c, '07700000000'); // customer

    expect(session.role, UserRole.customer);
    expect(session.permissions, isEmpty);
    expect(session.can(Permissions.catalogView), isFalse);
  });

  testWidgets('PermissionGate shows the child only when permitted', (
    tester,
  ) async {
    Widget gate(List<String> held) => ProviderScope(
      retry: (retryCount, error) => null,
      overrides: [permissionsProvider.overrideWithValue(held)],
      child: const Directionality(
        textDirection: TextDirection.ltr,
        child: PermissionGate(
          permission: 'orders.confirm',
          fallback: Text('denied'),
          child: Text('granted'),
        ),
      ),
    );

    await tester.pumpWidget(gate(const ['orders.confirm']));
    expect(find.text('granted'), findsOneWidget);
    expect(find.text('denied'), findsNothing);

    await tester.pumpWidget(gate(const ['catalog.view']));
    expect(find.text('denied'), findsOneWidget);
    expect(find.text('granted'), findsNothing);
  });
}
