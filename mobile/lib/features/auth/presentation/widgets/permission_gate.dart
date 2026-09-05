import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/auth_providers.dart';

/// Shows [child] only when the current session holds [permission] (all of
/// [anyOf] where given, matching any one). Otherwise renders [fallback]
/// (nothing by default).
///
/// This is the in-screen half of RBAC: `RoleGuard` decides which *area* a role
/// may enter; `PermissionGate` hides individual actions and sections the user's
/// permissions do not grant (architecture rule #3).
class PermissionGate extends ConsumerWidget {
  const PermissionGate({
    super.key,
    this.permission,
    this.anyOf,
    required this.child,
    this.fallback = const SizedBox.shrink(),
  }) : assert(
         permission != null || anyOf != null,
         'Provide either permission or anyOf',
       );

  /// A single required permission.
  final String? permission;

  /// Grants access if the session holds any one of these.
  final List<String>? anyOf;

  final Widget child;
  final Widget fallback;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final held = ref.watch(permissionsProvider);
    final allowed =
        (permission != null && held.contains(permission)) ||
        (anyOf != null && anyOf!.any(held.contains));
    return allowed ? child : fallback;
  }
}
