import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/diagnostics/diagnostics.dart';
import '../../../core/l10n/locale_controller.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/session_credentials.dart';
import '../../auth/domain/session_exit_tasks.dart';
import '../../auth/domain/user_role.dart';
import '../../auth/presentation/providers/auth_providers.dart';
import '../data/device_registration.dart';
import '../data/firebase_push_client.dart';
import '../data/notification_settings.dart';
import '../domain/push_client.dart';
import '../domain/push_lifecycle.dart';

final pushClientFactoryProvider = Provider<Future<PushClient?> Function()>(
  (ref) => createFirebasePushClient,
);
final notificationSettingsOpenerProvider = Provider(
  (ref) => NotificationSettingsOpener(),
);
final deviceRegistrationProvider = Provider<DeviceRegistration>(
  (ref) => DeviceRegistrationRemote(ref.watch(apiClientProvider)),
);
final pushOwnerProvider = Provider<PushOwner?>((ref) {
  final session = ref.watch(sessionControllerProvider).asData?.value;
  if (session?.isSignedIn != true ||
      session?.role != UserRole.customer ||
      session?.user?.id == null) {
    return null;
  }
  return (
    userId: session!.user!.id!,
    revision: ref.read(sessionCredentialsProvider).revision,
    locale: ref.watch(localeControllerProvider).languageCode,
  );
});
typedef OwnedPushEvent = ({PushEvent event, PushOwner owner});
final _pushEventsProvider = Provider((ref) {
  final events = StreamController<OwnedPushEvent>.broadcast();
  ref.onDispose(events.close);
  return events;
});
final pushEventsProvider = StreamProvider(
  (ref) => ref.watch(_pushEventsProvider).stream,
);

final pushLifecycleProvider = Provider<PushLifecycle>((ref) {
  final events = ref.watch(_pushEventsProvider);
  final lifecycle = PushLifecycle(
    createClient: ref.watch(pushClientFactoryProvider),
    devices: ref.watch(deviceRegistrationProvider),
    report: (error, stack) =>
        Diagnostics.report(error, stack, boundary: 'push.lifecycle'),
    onEvent: (event, owner) {
      if (ref.mounted && !events.isClosed) {
        events.add((event: event, owner: owner));
      }
    },
  );
  final remove = ref
      .read(sessionExitTasksProvider)
      .register(
        (revision, skipUnregister) =>
            lifecycle.endSession(revision, unregister: !skipUnregister),
      );
  ref.onDispose(() {
    remove();
    lifecycle.dispose();
  });
  return lifecycle;
});

/// Silent session/resume sync; the app bridge requests initial permission only
/// after the foreground UI is ready. Resume also retries APNs/network failures.
final pushSyncProvider = Provider<void>((ref) {
  final lifecycle = ref.watch(pushLifecycleProvider);
  void sync({bool refreshRegistration = false}) {
    if (!ref.read(sessionRevalidationProvider).hasValue) return;
    unawaited(
      lifecycle
          .synchronize(
            ref.read(pushOwnerProvider),
            refreshRegistration: refreshRegistration,
          )
          .then<void>((_) {}, onError: (Object _, StackTrace _) {}),
    );
  }

  ref.listen(pushOwnerProvider, (_, _) => sync());
  ref.listen(sessionRevalidationProvider, (previous, next) {
    if (previous?.hasValue == false && next.hasValue) {
      sync(refreshRegistration: true);
    }
  });
  final observer = AppLifecycleListener(
    onResume: () => sync(refreshRegistration: true),
  );
  ref.onDispose(observer.dispose);
  scheduleMicrotask(() {
    if (ref.mounted) sync();
  });
});
