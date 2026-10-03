import '../../../core/network/api_client.dart';
import '../../../core/error/response_decode.dart';

class InboxNotification {
  const InboxNotification({
    required this.id,
    required this.targetRole,
    required this.titleAr,
    required this.titleEn,
    required this.bodyAr,
    required this.bodyEn,
    required this.entityType,
    required this.entityId,
    required this.createdAt,
    this.readAt,
  });
  final String id,
      targetRole,
      titleAr,
      titleEn,
      bodyAr,
      bodyEn,
      entityType,
      entityId;
  final DateTime createdAt;
  final DateTime? readAt;
  factory InboxNotification.fromJson(Map<String, dynamic> json) =>
      InboxNotification(
        id: json['id'] as String,
        targetRole: json['target_role'] as String,
        titleAr: json['title_ar'] as String,
        titleEn: json['title_en'] as String,
        bodyAr: json['body_ar'] as String,
        bodyEn: json['body_en'] as String,
        entityType: json['entity_type'] as String,
        entityId: json['entity_id'] as String,
        createdAt: DateTime.parse(json['created_at'] as String),
        readAt: json['read_at'] == null
            ? null
            : DateTime.parse(json['read_at'] as String),
      );
}

class InboxPage {
  const InboxPage({
    required this.items,
    required this.page,
    required this.total,
  });
  final List<InboxNotification> items;
  final int page, total;
  bool get hasMore => page * 20 < total;
  factory InboxPage.fromJson(Map<String, dynamic> json) => InboxPage(
    items: (json['data'] as List)
        .map((j) => InboxNotification.fromJson(j as Map<String, dynamic>))
        .toList(),
    page: json['page'] as int,
    total: json['total'] as int,
  );
}

class NotificationRepository {
  const NotificationRepository(this.api);
  final ApiClient api;
  Future<InboxPage> fetch({int page = 1}) => decodeResponse(
    () async => InboxPage.fromJson(
      await api.get<Map<String, dynamic>>(
        '/me/notifications',
        query: {'page': page, 'per_page': 20},
      ),
    ),
  );
  Future<int> unreadCount() => decodeResponse(
    () async =>
        (await api.get<Map<String, dynamic>>(
              '/me/notifications/unread-count',
            ))['unread_count']
            as int,
  );
  Future<void> read(String id) => decodeResponse(() async {
    await api.patch<Map<String, dynamic>>(
      '/me/notifications/${Uri.encodeComponent(id)}/read',
    );
  });
}
