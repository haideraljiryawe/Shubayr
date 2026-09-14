import '../../../core/error/failure.dart';
import '../../auth/domain/permissions.dart';

enum AdminResource {
  products,
  categories,
  users,
  roles,
  suppliers,
  warehouses,
  locations,
  permissions;

  String get readPermission => switch (this) {
    products || categories => Permissions.catalogManage,
    users || roles || permissions => Permissions.usersManage,
    suppliers => Permissions.purchasingView,
    warehouses || locations => Permissions.inventoryView,
  };
  String get writePermission =>
      this == suppliers ? Permissions.purchasingManage : readPermission;
  bool get canCreate =>
      const [products, categories, users, roles, suppliers].contains(this);
  bool get canEdit => const [products, categories, users, roles].contains(this);
  bool get canDelete => canEdit;
  bool get canSearch => this == products || this == users;
  String path({bool write = false, String? warehouseId}) => switch (this) {
    products => write ? '/admin/products' : '/products',
    categories => write ? '/admin/categories' : '/categories',
    users => '/admin/users',
    roles => '/admin/roles',
    suppliers => '/suppliers',
    warehouses => '/warehouses',
    locations => '/warehouses/$warehouseId/locations',
    permissions => '/admin/permissions',
  };

  Set<String> get fields => switch (this) {
    products => {
      'category_id',
      'name_en',
      'name_ar',
      'description',
      'sale_price',
      'compare_at_price',
      'is_negotiable',
      'floor_price',
      'points_price',
      'tracks_expiry',
      'status',
      'images',
      'variants',
    },
    categories => {
      'parent_id',
      'name_en',
      'name_ar',
      'icon',
      'sort_order',
      'is_active',
    },
    users => {'name', 'phone', 'email', 'role', 'is_active', 'password'},
    roles => {'name', 'description', 'permissions'},
    suppliers => {'name', 'phone', 'email', 'address', 'is_active'},
    _ => {},
  };
  Set<String> get requiredFields => switch (this) {
    products => {'category_id', 'name_en', 'name_ar', 'sale_price'},
    categories => {'name_en', 'name_ar'},
    users => {'phone'},
    roles || suppliers => {'name'},
    _ => {},
  };

  /// Never send read-only fields such as stock, user permissions or role IDs.
  Map<String, dynamic> input(Map<String, dynamic> value) {
    final result = {
      for (final key in fields)
        if (value.containsKey(key)) key: value[key],
    };
    for (final key in requiredFields) {
      if (result[key] == null || result[key].toString().trim().isEmpty) {
        throw const AppFailure(FailureKind.validation);
      }
    }
    if (this == products && result['variants'] is List) {
      result['variants'] = [
        for (final variant in result['variants'] as List)
          {
            for (final key in ['sku', 'attributes', 'price_delta'])
              if ((variant as Map).containsKey(key)) key: variant[key],
          },
      ];
    }
    return result;
  }
}

/// A contract record retains optional fields on edit; forms expose only the
/// resource's write fields. No API shape is synthesized by the UI.
class AdminRecord {
  AdminRecord(Map<String, dynamic> json)
    : json = Map.unmodifiable(_withPricingAliases(json));
  final Map<String, dynamic> json;

  static Map<String, dynamic> _withPricingAliases(
    Map<String, dynamic> json,
  ) {
    if (!json.containsKey('effective_price')) return json;
    return {
      ...json,
      if (!json.containsKey('sale_price'))
        'sale_price': json['effective_price'],
      if (!json.containsKey('compare_at_price'))
        'compare_at_price': json['on_sale'] == true ? json['price'] : null,
    };
  }

  String get id => (json['id'] ?? json['key']) as String;
  String text(String key) => json[key]?.toString() ?? '';
  bool flag(String key, [bool fallback = false]) =>
      json[key] as bool? ?? fallback;
  String label(String language) => text('name_$language').isNotEmpty
      ? text('name_$language')
      : text('name').isNotEmpty
      ? text('name')
      : text('phone').isNotEmpty
      ? text('phone')
      : id;
}

class AdminPage {
  const AdminPage({
    required this.items,
    required this.page,
    required this.perPage,
    required this.total,
  });
  final List<AdminRecord> items;
  final int page, perPage, total;
  bool get hasMore => page * perPage < total;
}

abstract interface class AdminRepository {
  Future<AdminPage> fetch(
    AdminResource resource, {
    int page = 1,
    int perPage = 20,
    String query = '',
    String? role,
    String? warehouseId,
  });
  Future<AdminRecord> save(
    AdminResource resource,
    Map<String, dynamic> input, {
    String? id,
  });
  Future<void> delete(AdminResource resource, String id);
}
