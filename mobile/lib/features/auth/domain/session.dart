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

  /// The application *area* this session may enter (customer / delivery /
  /// staff). Route access is gated on this — see [UserRole] and `RoleGuard`.
  UserRole get role => UserRole.fromApi(user?.role);

  /// The RBAC permission keys granted to this user (empty for guests and
  /// customers). Use [can] for fine-grained gating *within* an area.
  List<String> get permissions => user?.permissions ?? const [];

  /// Whether this session holds the given RBAC permission, e.g.
  /// `session.can('orders.confirm')`.
  bool can(String permission) => permissions.contains(permission);

  @override
  bool operator ==(Object other) =>
      other is Session &&
      other.user?.id == user?.id &&
      other.user?.name == user?.name &&
      other.role == role &&
      other.permissions.length == permissions.length;

  @override
  int get hashCode =>
      Object.hash(user?.id, user?.name, role, permissions.length);
}
