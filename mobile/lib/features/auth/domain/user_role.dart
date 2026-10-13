import 'package:flutter/foundation.dart' show kDebugMode;

/// Phone sessions contain only these app roles. Unknown and legacy staff roles
/// are rejected instead of falling through into the customer's shopping area.
enum UserRole {
  customer,
  delivery,
  monitor,
  unsupported;

  /// Release 1 is customer-only. Debug retains existing work-role development
  /// routes; profile/release cannot authorize those identities.
  static UserRole fromApi(String? role, {bool customerOnly = !kDebugMode}) =>
      switch (role) {
        'customer' => UserRole.customer,
        'delivery_agent' when !customerOnly => UserRole.delivery,
        'order_monitor' when !customerOnly => UserRole.monitor,
        _ => UserRole.unsupported,
      };
}
