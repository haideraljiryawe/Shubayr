import 'package:flutter/foundation.dart' show immutable;

import '../data/user.dart';
import 'user_role.dart';

/// Who is using the app right now.
@immutable
class Session {
  const Session.signedOut() : user = null;
  const Session.signedIn(User this.user);

  final User? user;

  bool get isSignedIn =>
      user != null && user!.surface == 'app' && role != UserRole.unsupported;

  /// The server-assigned application area.
  UserRole get role =>
      user == null ? UserRole.customer : UserRole.fromApi(user!.role);

  @override
  bool operator ==(Object other) =>
      other is Session &&
      other.user?.id == user?.id &&
      other.user?.name == user?.name &&
      other.user?.email == user?.email &&
      other.role == role &&
      other.user?.surface == user?.surface;

  @override
  int get hashCode =>
      Object.hash(user?.id, user?.name, user?.email, role, user?.surface);
}
