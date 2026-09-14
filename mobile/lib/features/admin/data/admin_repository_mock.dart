import '../../../core/error/failure.dart';
import '../../auth/domain/permissions.dart';
import '../../catalog/data/catalog_repository_mock.dart';
import '../../catalog/data/product.dart';
import '../domain/admin_repository.dart';
import '../../catalog/data/category_description_limits.dart';
import '../../catalog/data/media/catalog_image.dart';

class AdminRepositoryMock implements AdminRepository {
  AdminRepositoryMock({
    this.catalog,
    this.delay = const Duration(milliseconds: 250),
  });
  final CatalogRepositoryMock? catalog;
  final Duration delay;
  final _data = <AdminResource, List<AdminRecord>>{};
  Future<void>? _initializing;
  int _sequence = 100;
  Future<void> _ready() => _initializing ??= _seed();
  Future<void> _seed() async {
    final source = catalog ?? CatalogRepositoryMock(delay: Duration.zero);
    final categories = source.adminCategories;
    final flat = <AdminRecord>[];
    void flatten(Map<String, dynamic> category) {
      flat.add(AdminRecord(category));
      for (final child in category['children'] as List? ?? []) {
        flatten(Map<String, dynamic>.from(child as Map));
      }
    }

    for (final category in categories) {
      flatten(category.toMock());
    }
    _data[AdminResource.categories] = flat;
    final products = <AdminRecord>[];
    for (var page = 1; ; page++) {
      final result = await source.fetchProducts(page: page, perPage: 100);
      // Use the detail gallery when seeding the editor so an unrelated save
      // cannot silently drop the extra legacy Mock gallery images.
      products.addAll(
        await Future.wait(
          result.data.map(
            (p) async =>
                AdminRecord((await source.fetchProduct(p.id)).toMock()),
          ),
        ),
      );
      if (page * result.perPage >= result.total) break;
    }
    _data[AdminResource.products] = products;
    _data[AdminResource.roles] = [
      for (final entry in Permissions.byRole.entries)
        AdminRecord({
          'id': 'role-${entry.key}',
          'name': entry.key,
          'permissions': entry.value,
          'is_system': true,
        }),
    ];
    _data[AdminResource.permissions] = [
      for (final key in Permissions.all)
        AdminRecord({
          'key': key,
          'group': key.split('.').first,
          'description': null,
        }),
    ];
    _data[AdminResource.users] = [
      for (var i = 1; i <= 25; i++)
        AdminRecord({
          'id': 'user-$i',
          'name': 'مستخدم $i',
          'phone': '077000${i.toString().padLeft(5, '0')}',
          'email': null,
          'role': i.isEven ? 'warehouse' : 'customer',
          'is_active': true,
          'permissions':
              Permissions.byRole[i.isEven ? 'warehouse' : 'customer'],
        }),
    ];
    _data[AdminResource.suppliers] = [
      for (var i = 1; i <= 23; i++)
        AdminRecord({
          'id': 'supplier-$i',
          'name': 'مورد $i',
          'phone': '078000${i.toString().padLeft(5, '0')}',
          'email': null,
          'address': 'بغداد',
          'is_active': true,
        }),
    ];
    _data[AdminResource.warehouses] = [
      for (var i = 1; i <= 3; i++)
        AdminRecord({
          'id': 'warehouse-$i',
          'name': 'مخزن $i',
          'code': 'WH-$i',
          'is_active': i != 3,
        }),
    ];
    _data[AdminResource.locations] = [
      for (var w = 1; w <= 3; w++)
        for (var i = 1; i <= 25; i++)
          AdminRecord({
            'id': 'location-$w-$i',
            'warehouse_id': 'warehouse-$w',
            'zone': 'A',
            'aisle': '$w',
            'shelf': '$i',
            'bin': '1',
          }),
    ];
  }

  @override
  Future<AdminPage> fetch(
    AdminResource resource, {
    int page = 1,
    int perPage = 20,
    String query = '',
    String? role,
    String? warehouseId,
    String? categoryId,
  }) async {
    await _ready();
    await Future<void>.delayed(delay);
    if (resource == AdminResource.locations &&
        !_data[AdminResource.warehouses]!.any((w) => w.id == warehouseId)) {
      throw const AppFailure(FailureKind.notFound);
    }
    Set<String>? scope;
    if (resource == AdminResource.products && categoryId != null) {
      scope = {categoryId};
      final children = <String, List<String>>{};
      for (final category in _data[AdminResource.categories]!) {
        (children[category.text('parent_id')] ??= []).add(category.id);
      }
      final pending = [categoryId];
      while (pending.isNotEmpty) {
        for (final child in children[pending.removeLast()] ?? <String>[]) {
          if (scope.add(child)) pending.add(child);
        }
      }
    }
    var values = _data[resource]!.where((record) {
      if (resource == AdminResource.products &&
          (record.text('status') == 'archived' ||
              (scope != null && !scope.contains(record.text('category_id'))))) {
        return false;
      }
      if (resource == AdminResource.locations &&
          record.text('warehouse_id') != warehouseId) {
        return false;
      }
      if (resource == AdminResource.users &&
          role != null &&
          record.text('role') != role) {
        return false;
      }
      if (resource.canSearch && query.trim().isNotEmpty) {
        final keys = resource == AdminResource.users
            ? ['name', 'phone', 'email']
            : ['name_ar', 'name_en'];
        if (!keys.any(
          (key) => record
              .text(key)
              .toLowerCase()
              .contains(query.trim().toLowerCase()),
        )) {
          return false;
        }
      }
      return true;
    }).toList();
    if (resource == AdminResource.categories ||
        resource == AdminResource.permissions) {
      return AdminPage(
        items: List.unmodifiable(values),
        page: 1,
        perPage: values.isEmpty ? 1 : values.length,
        total: values.length,
      );
    }
    return AdminPage(
      items: List.unmodifiable(values.skip((page - 1) * perPage).take(perPage)),
      page: page,
      perPage: perPage,
      total: values.length,
    );
  }

  @override
  Future<AdminRecord> save(
    AdminResource resource,
    Map<String, dynamic> input, {
    String? id,
  }) async {
    await _ready();
    await Future<void>.delayed(delay);
    if (id == null ? !resource.canCreate : !resource.canEdit) {
      throw const AppFailure(FailureKind.validation);
    }
    final payload = resource.input(input);
    for (final key in switch (resource) {
      AdminResource.categories => const [
        'mock_icon_key',
        'mock_description_en',
        'mock_description_ar',
        'mock_image',
        'mock_image_managed',
      ],
      AdminResource.products => const ['mock_images'],
      _ => const <String>[],
    }) {
      if (input.containsKey(key)) payload[key] = input[key];
    }
    final values = _data[resource]!;
    final index = id == null ? -1 : values.indexWhere((v) => v.id == id);
    if (id != null && index < 0) throw const AppFailure(FailureKind.notFound);
    final previous = index < 0 ? <String, dynamic>{} : values[index].json;
    final merged = {
      ...previous,
      ...payload,
      'id': id ?? 'admin-${resource.name}-${_sequence++}',
    };
    if (resource == AdminResource.categories ||
        resource == AdminResource.users ||
        resource == AdminResource.suppliers) {
      merged['is_active'] ??= true;
    }
    if (resource == AdminResource.categories) {
      merged['sort_order'] ??= 0;
      merged['mock_icon_key'] ??= 'general_category';
      if (merged['mock_icon_key'] is! String) {
        throw const AppFailure(FailureKind.validation);
      }
      if (index < 0) merged['mock_image_managed'] = true;
      if (merged['parent_id'] == null) {
        for (final key in ['mock_description_en', 'mock_description_ar']) {
          final value = merged[key];
          if (value is! String || !CategoryDescriptionLimits.isValid(value)) {
            throw const AppFailure(FailureKind.validation);
          }
          merged[key] = value.trim();
        }
      }
      if (merged['mock_image'] != null &&
          merged['mock_image'] is! CatalogImage) {
        throw const AppFailure(FailureKind.validation);
      }
      final parent = merged['parent_id'];
      var ancestor = parent;
      final seen = <String>{};
      while (ancestor != null) {
        if (ancestor == merged['id'] || !seen.add(ancestor as String)) {
          throw const AppFailure(FailureKind.validation);
        }
        final node = values.where((v) => v.id == ancestor).firstOrNull;
        if (node == null) throw const AppFailure(FailureKind.validation);
        ancestor = node.json['parent_id'];
      }
      merged.remove('children');
    }
    if (resource == AdminResource.products) {
      if (merged['mock_images'] case final List images) {
        if (images.any((image) => image is! CatalogImage)) {
          throw const AppFailure(FailureKind.validation);
        }
        merged['mock_images'] = List<CatalogImage>.unmodifiable(images);
      }
      merged['discount_percent'] = Product.discountPercentFor(
        merged['sale_price'] as num,
        merged['compare_at_price'] as num?,
      );
      merged['status'] ??= 'active';
      merged['is_negotiable'] ??= false;
      merged['tracks_expiry'] ??= false;
      if (!_data[AdminResource.categories]!.any(
        (c) => c.id == merged['category_id'],
      )) {
        throw const AppFailure(FailureKind.validation);
      }
      merged['variants'] = [
        for (final (i, v) in ((merged['variants'] as List?) ?? []).indexed)
          {
            ...Map<String, dynamic>.from(v as Map),
            'id': 'variant-${merged['id']}-$i',
          },
      ];
      // Stock is established by inventory operations, never a catalog input.
      if (index < 0) {
        merged['in_stock'] = false;
        merged['available_qty'] = 0;
      }
    }
    if (resource == AdminResource.users) {
      if (values.any((v) => v.id != id && v.text('phone') == merged['phone'])) {
        throw const AppFailure(FailureKind.validation);
      }
      final role = _data[AdminResource.roles]!
          .where((r) => r.text('name') == (merged['role'] ?? 'customer'))
          .firstOrNull;
      if (role == null) throw const AppFailure(FailureKind.validation);
      merged['role'] = role.text('name');
      merged['permissions'] = role.json['permissions'];
      merged.remove('password');
    }
    if (resource == AdminResource.roles) {
      if (values.any((v) => v.id != id && v.text('name') == merged['name'])) {
        throw const AppFailure(FailureKind.validation);
      }
      if ((merged['permissions'] as List? ?? []).any(
        (p) => !Permissions.all.contains(p),
      )) {
        throw const AppFailure(FailureKind.validation);
      }
      if (previous['is_system'] == true && merged['name'] != previous['name']) {
        throw const AppFailure(FailureKind.validation);
      }
      merged['is_system'] ??= false;
    }
    final saved = AdminRecord(merged);
    if (index < 0) {
      values.insert(0, saved);
    } else {
      values[index] = saved;
    }
    if (resource == AdminResource.roles && index >= 0) {
      final users = _data[AdminResource.users]!;
      for (var i = 0; i < users.length; i++) {
        if (users[i].text('role') == previous['name']) {
          users[i] = AdminRecord({
            ...users[i].json,
            'role': saved.text('name'),
            'permissions': saved.json['permissions'],
          });
        }
      }
    }
    _syncCatalog(resource);
    return saved;
  }

  @override
  Future<void> delete(AdminResource resource, String id) async {
    await _ready();
    await Future<void>.delayed(delay);
    if (!resource.canDelete) throw const AppFailure(FailureKind.validation);
    final record = _data[resource]!.where((v) => v.id == id).firstOrNull;
    if (record == null) throw const AppFailure(FailureKind.notFound);
    if (resource == AdminResource.categories &&
        (_data[AdminResource.categories]!.any(
              (c) => c.text('parent_id') == id,
            ) ||
            _data[AdminResource.products]!.any(
              (p) => p.text('category_id') == id,
            ))) {
      throw const AppFailure(FailureKind.validation);
    }
    if (resource == AdminResource.roles &&
        (record.flag('is_system') ||
            _data[AdminResource.users]!.any(
              (u) => u.text('role') == record.text('name'),
            ))) {
      throw const AppFailure(FailureKind.validation);
    }
    if (resource == AdminResource.products) {
      final index = _data[resource]!.indexWhere((v) => v.id == id);
      _data[resource]![index] = AdminRecord({
        ...record.json,
        'status': 'archived',
      });
    } else {
      _data[resource]!.removeWhere((v) => v.id == id);
    }
    _syncCatalog(resource);
  }

  void _syncCatalog(AdminResource resource) {
    if (catalog == null) return;
    if (resource == AdminResource.products ||
        resource == AdminResource.categories) {
      catalog!.applyAdminCatalog(
        products: _data[AdminResource.products]!.map((v) => v.json).toList(),
        categories: _data[AdminResource.categories]!
            .map((v) => v.json)
            .toList(),
      );
    }
  }
}
