import '../../../core/error/failure.dart';
import '../../../core/network/api_client.dart';
import '../domain/admin_repository.dart';

class AdminRepositoryRemote implements AdminRepository {
  const AdminRepositoryRemote(this.api);
  final ApiClient api;
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
    if (resource == AdminResource.locations && warehouseId == null) {
      throw const AppFailure(FailureKind.validation);
    }
    final path = resource.path(warehouseId: warehouseId);
    if (resource == AdminResource.categories ||
        resource == AdminResource.permissions) {
      final values = await api.get<List<dynamic>>(path);
      final items = <AdminRecord>[];
      void append(Map<String, dynamic> value) {
        items.add(AdminRecord(value));
        for (final child in value['children'] as List? ?? []) {
          append(Map<String, dynamic>.from(child as Map));
        }
      }

      for (final value in values) {
        append(Map<String, dynamic>.from(value as Map));
      }
      return AdminPage(
        items: items,
        page: 1,
        perPage: items.isEmpty ? 1 : items.length,
        total: items.length,
      );
    }
    final json = await api.get<Map<String, dynamic>>(
      path,
      query: {
        'page': page,
        'per_page': perPage,
        if (resource == AdminResource.products && categoryId != null)
          'category_id': categoryId,
        if (resource.canSearch && query.trim().isNotEmpty) 'q': query.trim(),
        if (resource == AdminResource.users && role != null) 'role': role,
      },
    );
    return AdminPage(
      items: [
        for (final value in json['data'] as List)
          AdminRecord(Map<String, dynamic>.from(value as Map)),
      ],
      page: (json['page'] as num).toInt(),
      perPage: (json['per_page'] as num).toInt(),
      total: (json['total'] as num).toInt(),
    );
  }

  @override
  Future<AdminRecord> save(
    AdminResource resource,
    Map<String, dynamic> input, {
    String? id,
  }) async {
    if (id == null ? !resource.canCreate : !resource.canEdit) {
      throw const AppFailure(FailureKind.validation);
    }
    if (input.keys.any((key) => key.startsWith('mock_'))) {
      throw const AppFailure(FailureKind.validation);
    }
    final body = resource.input(input);
    return AdminRecord(
      id == null
          ? await api.post<Map<String, dynamic>>(
              resource.path(write: true),
              body: body,
            )
          : await api.patch<Map<String, dynamic>>(
              '${resource.path(write: true)}/$id',
              body: body,
            ),
    );
  }

  @override
  Future<void> delete(AdminResource resource, String id) {
    if (!resource.canDelete) throw const AppFailure(FailureKind.validation);
    return api.deleteVoid('${resource.path(write: true)}/$id');
  }
}
