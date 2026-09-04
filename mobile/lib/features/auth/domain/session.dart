import 'package:flutter/foundation.dart' show immutable;

import '../data/user.dart';
import 'user_role.dart';

/// Who is using the app right now.
@immutable
class Session {
  const Session.signedOut() : user = null;
  const Session.signedIn(User this.user);

  final User? user;

  bool get isSignedIn => user != null;

  /// The area this session may enter. Role-based only — the contract exposes
  /// no permissions yet.
  UserRole get role => UserRole.fromApi(user?.role);

  @override
  bool operator ==(Object other) =>
      other is Session && other.user?.id == user?.id && other.role == role;

  @override
  int get hashCode => Object.hash(user?.id, role);
}
