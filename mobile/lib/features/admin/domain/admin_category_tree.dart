import 'admin_repository.dart';

/// Read-only index of the existing parent_id tree, including hidden records.
/// Shared by management hierarchy and category scope labels.
class AdminCategoryTree {
  AdminCategoryTree(List<AdminRecord> records)
    : byId = {for (final record in records) record.id: record} {
    for (final record in records) {
      final parent = record.text('parent_id');
      final key = byId.containsKey(parent) ? parent : '';
      (_children[key] ??= []).add(record);
    }
    for (final siblings in _children.values) {
      siblings.sort((a, b) {
        final order = ((a.json['sort_order'] as num?) ?? 0).compareTo(
          (b.json['sort_order'] as num?) ?? 0,
        );
        return order != 0 ? order : a.id.compareTo(b.id);
      });
    }
  }
  final Map<String, AdminRecord> byId;
  final _children = <String, List<AdminRecord>>{};
  List<AdminRecord> get roots => children('');
  List<AdminRecord> children(String id) => _children[id] ?? const [];
  List<AdminRecord> ancestors(String id) {
    final result = <AdminRecord>[];
    final seen = <String>{};
    var node = byId[id];
    while (node != null && seen.add(node.id)) {
      result.insert(0, node);
      node = byId[node.text('parent_id')];
    }
    return result;
  }

  String label(String id, String language) =>
      ancestors(id).map((node) => node.label(language)).join(' / ');
}
