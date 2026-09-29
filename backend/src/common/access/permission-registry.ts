export const PERMISSION_REGISTRY = {
  'orders.view': ['orders', 'View orders'],
  'orders.accept': ['orders', 'Accept pending orders'],
  'orders.reject': ['orders', 'Reject pending orders'],
  'orders.prepare': ['orders', 'Move accepted orders into preparation'],
  'orders.mark_ready': ['orders', 'Mark prepared orders ready'],
  'orders.handover': ['orders', 'Hand ready orders to delivery'],
  'orders.cancel': ['orders', 'Cancel an order'],
  'orders.assign_agent': ['orders', 'Assign a delivery agent'],
  'catalog.categories': ['catalog', 'Manage categories'],
  'catalog.brands': ['catalog', 'Manage brands'],
  'catalog.products': ['catalog', 'Manage products and banners'],
  'prices.change': ['catalog', 'Change sale prices'],
  'cost.view': ['purchasing', 'View product cost'],
  'suppliers.view': ['purchasing', 'View suppliers'],
  'suppliers.manage': ['purchasing', 'Manage suppliers'],
  'purchases.create': ['purchasing', 'Create purchase invoices'],
  'purchases.correct': ['purchasing', 'Correct purchase invoices'],
  'payments.record': ['payments', 'Record payments'],
  'payments.reverse': ['payments', 'Reverse payments'],
  'inventory.count': ['inventory', 'Count inventory'],
  'inventory.pick': ['inventory', 'Pick reserved inventory'],
  'inventory.transfer': ['inventory', 'Transfer inventory'],
  'inventory.adjust': ['inventory', 'Adjust inventory'],
  'returns.inspect': ['returns', 'Inspect returns'],
  'returns.approve': ['returns', 'Approve returns'],
  'returns.refund': ['returns', 'Refund returns'],
  'reviews.moderate': ['reviews', 'Moderate product reviews'],
  'loyalty.adjust': ['loyalty', 'Adjust loyalty balances'],
  'deliveries.manage': ['deliveries', 'List and manage deliveries'],
  'users.manage': ['access', 'Manage staff and work phones'],
  'roles.manage': ['access', 'Manage permission presets'],
  'audit.view': ['access', 'View audit logs'],
  'fx_rates.update': ['finance', 'Update exchange rates'],
  'ledger.view': ['finance', 'View ledger and trial balance'],
  'ledger.reverse': ['finance', 'Reverse posted ledger entries'],
  'cash_accounts.manage': ['finance', 'Manage cash and bank accounts'],
  'period.reopen': ['accounting', 'Reopen closed accounting periods'],
  'backdate.approve': [
    'controls',
    'Approve documents outside the back-dating window',
  ],
  'settings.manage': ['settings', 'Manage store settings'],
  'reports.view': ['reports', 'View reports'],
  'period.close': ['accounting', 'Close accounting periods'],
} as const;

export type PermissionKey = keyof typeof PERMISSION_REGISTRY;

export const PERMISSION_KEYS = Object.freeze(
  Object.keys(PERMISSION_REGISTRY) as PermissionKey[],
);

export function isPermissionKey(value: string): value is PermissionKey {
  return Object.prototype.hasOwnProperty.call(PERMISSION_REGISTRY, value);
}
