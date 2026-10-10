import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';

const customerSession = Session.signedIn(
  User(id: 'customer', role: 'customer'),
);
const monitorSession = Session.signedIn(
  User(id: 'monitor', role: 'order_monitor'),
);

class TestSession extends SessionController {
  TestSession({this.initial = customerSession});
  final Session initial;
  @override
  Future<Session> build() async => initial;
  void setSession(Session session) => state = AsyncData(session);
}
