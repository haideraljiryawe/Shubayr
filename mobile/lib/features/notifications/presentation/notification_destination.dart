import '../../../app/router/app_routes.dart';
import '../../auth/domain/user_role.dart';
import '../data/notification_repository.dart';

/// Role-checked navigation belongs to presentation, not the API payload.
extension NotificationDestination on InboxNotification {
  /// Build only known in-app destinations; never navigate to a server-provided URL.
  String? destination(UserRole role) {
    if (UserRole.fromApi(targetRole) != role) return null;
    if (role == UserRole.monitor && entityType == 'order') {
      return '${AppRoutes.monitor}/${Uri.encodeComponent(entityId)}';
    }
    if (role == UserRole.customer && entityType == 'order') {
      return '${AppRoutes.orders}/${Uri.encodeComponent(entityId)}';
    }
    if (role == UserRole.delivery) return AppRoutes.delivery;
    return null;
  }
}
