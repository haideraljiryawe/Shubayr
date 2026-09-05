import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../auth/presentation/providers/auth_providers.dart';

/// The signed-in user's profile editor.
///
/// Photo (upload arrives with the backend) → name → Save (enabled only when
/// something changed) → Sign out, and a deliberately isolated Delete account
/// action at the bottom. Shared by every role (customer, delivery, staff).
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _nameController = TextEditingController();
  String _initialName = '';
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _initialName =
        ref.read(sessionControllerProvider).valueOrNull?.user?.name ?? '';
    _nameController
      ..text = _initialName
      ..addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  String get _name => _nameController.text.trim();
  bool get _dirty => _name != _initialName.trim();
  bool get _canSave => _dirty && _name.isNotEmpty && !_saving;

  Future<void> _save() async {
    setState(() => _saving = true);
    await ref
        .read(sessionControllerProvider.notifier)
        .updateProfile(name: _name);
    if (!mounted) return;
    setState(() {
      _initialName = _name;
      _saving = false;
    });
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(context.l10n.profileSaved)));
  }

  Future<void> _signOut() async {
    await ref.read(sessionControllerProvider.notifier).signOut();
    if (!mounted) return;
    // Land on the public home rather than letting the guard bounce a now-guest
    // to the sign-in screen from this pushed route.
    context.go(AppRoutes.home);
  }

  Future<void> _confirmDelete() async {
    final l10n = context.l10n;
    final colors = context.colors;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.profileDeleteTitle),
        content: Text(l10n.profileDeleteMessage),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(l10n.actionCancel),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: colors.danger),
            child: Text(l10n.actionDelete),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      // Account deletion has no endpoint in the contract yet; keep it honest.
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(l10n.comingSoonTitle)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.colors;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.profileTitle)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.screenH),
        children: [
          const SizedBox(height: AppSpacing.md),
          Center(child: _Avatar(name: _initialName)),
          const SizedBox(height: AppSpacing.sm),
          Center(
            child: TextButton.icon(
              onPressed: () => ScaffoldMessenger.of(context)
                ..hideCurrentSnackBar()
                ..showSnackBar(
                  SnackBar(content: Text(l10n.comingSoonTitle)),
                ),
              icon: const Icon(Icons.photo_camera_outlined, size: 18),
              label: Text(l10n.profileChangePhoto),
            ),
          ),
          const SizedBox(height: AppSpacing.xl),
          TextField(
            controller: _nameController,
            textInputAction: TextInputAction.done,
            decoration: InputDecoration(
              labelText: l10n.profileName,
              prefixIcon: const Icon(Icons.person_outline),
            ),
          ),
          const SizedBox(height: AppSpacing.xl),
          AppButton(
            label: l10n.actionSave,
            icon: Icons.check,
            isLoading: _saving,
            onPressed: _canSave ? _save : null,
          ),
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            label: l10n.authSignOut,
            variant: AppButtonVariant.secondary,
            icon: Icons.logout,
            onPressed: _signOut,
          ),
          const SizedBox(height: AppSpacing.xxxl),
          // Isolated, low-emphasis and dangerous.
          Center(
            child: TextButton.icon(
              onPressed: _confirmDelete,
              style: TextButton.styleFrom(foregroundColor: colors.danger),
              icon: const Icon(Icons.delete_outline, size: 18),
              label: Text(l10n.profileDeleteAccount),
            ),
          ),
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final trimmed = name.trim();
    final child = trimmed.isEmpty
        ? Icon(Icons.person, size: 44, color: colors.onPrimary)
        : Text(
            trimmed.characters.first.toUpperCase(),
            style: context.text.displaySmall?.copyWith(color: colors.onPrimary),
          );

    return Stack(
      children: [
        Container(
          width: 96,
          height: 96,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: colors.primary, shape: BoxShape.circle),
          child: child,
        ),
        PositionedDirectional(
          end: 0,
          bottom: 0,
          child: Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: colors.surface,
              shape: BoxShape.circle,
              border: Border.all(color: colors.border),
            ),
            child: Icon(Icons.photo_camera_outlined, size: 18, color: colors.textSecondary),
          ),
        ),
      ],
    );
  }
}
