/// Phone sessions contain only these app roles. Unknown and legacy staff roles
/// are rejected instead of falling through into the customer's shopping area.
enum UserRole {
  customer,
  delivery,
  monitor,
  unsupported;

  static UserRole fromApi(String? role) => switch (role) {
    'customer' => UserRole.customer,
    'delivery_agent' => UserRole.delivery,
    'order_monitor' => UserRole.monitor,
    _ => UserRole.unsupported,
  };
}
