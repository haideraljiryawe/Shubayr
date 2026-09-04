/// The three application areas the app routes between.
///
/// The API returns a single role string (`User.role`). The role names come
/// from `infra/db/seed_rbac.sql`; everything that is not a customer or a
/// delivery agent is staff, and anything unrecognised falls back to the
/// least-privileged area.
enum UserRole {
  customer,
  delivery,
  staff;

  static UserRole fromApi(String? role) => switch (role?.trim().toLowerCase()) {
    'delivery' => UserRole.delivery,
    'admin' || 'manager' || 'purchasing' || 'warehouse' => UserRole.staff,
    _ => UserRole.customer,
  };
}
