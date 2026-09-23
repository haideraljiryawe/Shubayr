/// The RBAC permission keys, mirroring `infra/db/seed_rbac.sql`.
///
/// Screens gate on these via `Session.can(...)` or the `PermissionGate` widget,
/// so feature code never hard-codes permission strings.
abstract final class Permissions {
  static const catalogView = 'catalog.view';
  static const catalogManage = 'catalog.manage';
  static const ordersManage = 'orders.manage';
  static const ordersView = 'orders.view';
  static const ordersConfirm = 'orders.confirm';
  static const ordersUpdate = 'orders.update';
  static const inventoryView = 'inventory.view';
  static const inventoryPick = 'inventory.pick';
  static const inventoryAdjust = 'inventory.adjust';
  static const inventoryTransfer = 'inventory.transfer';
  static const purchasingView = 'purchasing.view';
  static const purchasingManage = 'purchasing.manage';
  static const returnsView = 'returns.view';
  static const returnsProcess = 'returns.process';
  static const deliveryAssigned = 'delivery.assigned';
  static const loyaltyManage = 'loyalty.manage';
  static const usersManage = 'users.manage';
  static const reportsView = 'reports.view';
  static const settingsManage = 'settings.manage';

  /// Every permission — the admin role holds all of them.
  static const all = <String>[
    catalogView,
    catalogManage,
    ordersManage,
    ordersView,
    ordersConfirm,
    ordersUpdate,
    inventoryView,
    inventoryPick,
    inventoryAdjust,
    inventoryTransfer,
    purchasingView,
    purchasingManage,
    returnsView,
    returnsProcess,
    deliveryAssigned,
    loyaltyManage,
    usersManage,
    reportsView,
    settingsManage,
  ];

  /// Permissions granted to each role, mirroring the `role_permissions` grants
  /// in `seed_rbac.sql`. Used by the mock; the real backend is the source of
  /// truth over the API.
  static const byRole = <String, List<String>>{
    'admin': all,
    'manager': [
      catalogView,
      catalogManage,
      ordersView,
      ordersConfirm,
      ordersUpdate,
      inventoryView,
      returnsView,
      returnsProcess,
      reportsView,
      loyaltyManage,
    ],
    'purchasing': [
      purchasingView,
      purchasingManage,
      inventoryView,
      catalogView,
    ],
    'warehouse': [
      inventoryView,
      inventoryPick,
      inventoryAdjust,
      inventoryTransfer,
      ordersView,
    ],
    'delivery': [deliveryAssigned, ordersView],
    'customer': <String>[],
  };
}
