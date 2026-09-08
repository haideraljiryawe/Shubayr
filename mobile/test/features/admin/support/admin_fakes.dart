import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/domain/permissions.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/admin/data/admin_repository_mock.dart';
import 'package:shubayr/features/admin/domain/admin_repository.dart';

const adminSession = Session.signedIn(
  User(id: 'admin-test', role: 'admin', permissions: Permissions.all),
);

class AdminTestSession extends SessionController {
  AdminTestSession({this.initial = adminSession});
  final Session initial;
  @override
  Future<Session> build() async => initial;
  void change(Session value) => state = AsyncData(value);
}

typedef AdminRequest = ({
  AdminResource resource,
  int page,
  int perPage,
  String query,
  String? role,
  String? warehouseId,
});

class RecordingAdmin extends AdminRepositoryMock {
  RecordingAdmin() : super(delay: Duration.zero);
  final requests = <AdminRequest>[];
  final writes =
      <({AdminResource resource, String? id, Map<String, dynamic> input})>[];
  final deletes = <String>[];
  Future<AdminPage> Function(AdminRequest)? onFetch;
  Future<AdminRecord> Function(AdminResource, Map<String, dynamic>, String?)?
  onSave;
  @override
  Future<AdminPage> fetch(
    AdminResource resource, {
    int page = 1,
    int perPage = 20,
    String query = '',
    String? role,
    String? warehouseId,
  }) {
    final request = (
      resource: resource,
      page: page,
      perPage: perPage,
      query: query,
      role: role,
      warehouseId: warehouseId,
    );
    requests.add(request);
    return onFetch?.call(request) ??
        super.fetch(
          resource,
          page: page,
          perPage: perPage,
          query: query,
          role: role,
          warehouseId: warehouseId,
        );
  }

  @override
  Future<AdminRecord> save(
    AdminResource resource,
    Map<String, dynamic> input, {
    String? id,
  }) {
    writes.add((resource: resource, id: id, input: input));
    return onSave?.call(resource, input, id) ??
        super.save(resource, input, id: id);
  }

  @override
  Future<void> delete(AdminResource resource, String id) {
    deletes.add(id);
    return super.delete(resource, id);
  }
}
