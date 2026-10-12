import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/l10n/l10n_context.dart';
import '../../../core/widgets/app_snackbar.dart';
import '../../../core/error/response_decode.dart';
import '../domain/push_client.dart';
import 'push_providers.dart';

class PushPermissionTile extends ConsumerStatefulWidget {
  const PushPermissionTile({super.key});
  @override
  ConsumerState<PushPermissionTile> createState() => _PushPermissionTileState();
}

class _PushPermissionTileState extends ConsumerState<PushPermissionTile> {
  bool _busy = false;
  Future<void> _enable() async {
    if (_busy) return;
    final owner = ref.read(pushOwnerProvider);
    if (owner == null) return;
    setState(() => _busy = true);
    final l10n = context.l10n;
    try {
      final permission = await ref
          .read(pushLifecycleProvider)
          .synchronize(owner, requestPermission: true);
      if (!mounted || ref.read(pushOwnerProvider) != owner) return;
      showAppSnackBarMessage(
        context,
        message: switch (permission) {
          PushPermission.authorized => l10n.pushEnabled,
          PushPermission.denied => l10n.pushDenied,
          PushPermission.notDetermined => l10n.pushPending,
          PushPermission.unavailable => l10n.pushUnavailable,
        },
      );
    } catch (error, stack) {
      if (mounted && ref.read(pushOwnerProvider) == owner) {
        showAppSnackBarMessage(
          context,
          message: actionFailure(error, stack).localizedMessage(l10n),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => ListTile(
    leading: const Icon(Icons.notifications_active_outlined),
    title: Text(context.l10n.pushEnable),
    onTap: _busy ? null : _enable,
    trailing: _busy
        ? const SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : const Icon(Icons.chevron_right),
  );
}
