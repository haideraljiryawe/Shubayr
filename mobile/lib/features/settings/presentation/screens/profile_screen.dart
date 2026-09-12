import '../../../admin/presentation/widgets/admin_app_bar.dart';
import '../../../../core/layout/app_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/error/failure.dart';
import '../../../auth/data/user.dart';
import '../../../auth/domain/profile_update.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../auth/presentation/providers/auth_providers.dart';

/// The signed-in user's profile editor.
///
/// Photo (upload arrives with the backend) → name/email → Save (enabled only when
/// something changed) → Sign out, and a deliberately isolated Delete account
/// action at the bottom. Shared by every role (customer, delivery, staff).
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _form = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  User? _initialUser;
  String _initialName = '', _initialEmail = '';
  bool _saving = false;
  AppFailure? _error;

  void _load(User? user) {
    _initialUser = user;
    _initialName = user?.name ?? '';
    _initialEmail = user?.email ?? '';
    _nameController.text = _initialName;
    _emailController.text = _initialEmail;
  }

  void _changed() => setState(() => _error = null);

  @override
  void initState() {
    super.initState();
    _load(ref.read(sessionControllerProvider).value?.user);
    _nameController.addListener(_changed);
    _emailController.addListener(_changed);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  String get _name => _nameController.text.trim();
  String get _email => _emailController.text.trim();
  bool get _nameChanged => _name != _initialName.trim();
  bool get _emailChanged => _email != _initialEmail.trim();
  bool get _dirty => _nameChanged || _emailChanged;
  bool get _canSave => _dirty && !_saving;

  Future<void> _save() async {
    if (!_canSave || !(_form.currentState?.validate() ?? false)) return;
    final update = ProfileUpdate(
      name: _nameChanged ? _name : null,
      email: _emailChanged && _email.isNotEmpty ? _email : null,
      clearEmail: _emailChanged && _email.isEmpty,
    );
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final saved = await ref
          .read(sessionControllerProvider.notifier)
          .updateProfile(update);
      if (!mounted || saved == null) return;
      setState(() => _load(saved));
      showAppSnackBarMessage(context, message: context.l10n.profileSaved);
    } catch (error) {
      if (mounted) {
        setState(
          () =>
              _error = error is AppFailure ? error : const AppFailure.unknown(),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
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
      showAppSnackBarMessage(context, message: l10n.comingSoonTitle);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(sessionControllerProvider, (_, next) {
      final user = next.value?.user;
      if (user != null &&
          (_initialUser == null ||
              user.id != _initialUser?.id ||
              user.phone != _initialUser?.phone)) {
        setState(() => _load(user));
      }
    });
    final signedIn =
        ref.watch(sessionControllerProvider).value?.isSignedIn ?? false;
    final l10n = context.l10n;
    final colors = context.colors;

    return Scaffold(
      appBar: adminAppBar(context, ref, title: l10n.profileTitle),
      body: ResponsiveContent(
        child: Form(
          key: _form,
          child: SingleChildScrollView(
            padding: AppLayout.pageInsets(context),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: AppSpacing.md),
                Center(child: _Avatar(name: _initialName)),
                const SizedBox(height: AppSpacing.sm),
                Center(
                  child: TextButton.icon(
                    onPressed: () => showAppSnackBarMessage(
                      context,
                      message: l10n.comingSoonTitle,
                    ),
                    icon: const Icon(Icons.photo_camera_outlined, size: 18),
                    label: Text(l10n.profileChangePhoto),
                  ),
                ),
                const SizedBox(height: AppSpacing.xl),
                ResponsiveFields(
                  children: [
                    TextFormField(
                      key: const ValueKey('profile-name'),
                      controller: _nameController,
                      enabled: !_saving && signedIn,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.name],
                      decoration: InputDecoration(
                        labelText: l10n.profileName,
                        prefixIcon: const Icon(Icons.person_outline),
                      ),
                      validator: (value) {
                        if (!_nameChanged) return null;
                        if ((value ?? '').trim().isEmpty) {
                          return l10n.profileNameRequired;
                        }
                        return ProfileUpdate.validName(value!)
                            ? null
                            : l10n.profileNameTooLong;
                      },
                    ),
                    TextFormField(
                      key: const ValueKey('profile-email'),
                      controller: _emailController,
                      enabled: !_saving && signedIn,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.email],
                      autocorrect: false,
                      decoration: InputDecoration(
                        labelText: l10n.profileEmail,
                        prefixIcon: const Icon(Icons.email_outlined),
                      ),
                      validator: (value) =>
                          !_emailChanged ||
                              (value ?? '').trim().isEmpty ||
                              ProfileUpdate.validEmail(value!)
                          ? null
                          : l10n.profileEmailInvalid,
                      onFieldSubmitted: (_) {
                        if (signedIn) _save();
                      },
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.xl),
                if (_error != null) ...[
                  Text(
                    _error!.localizedMessage(l10n),
                    style: context.text.bodyMedium?.copyWith(
                      color: colors.danger,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                ],
                AppButton(
                  label: l10n.actionSave,
                  icon: Icons.check,
                  isLoading: _saving,
                  onPressed: signedIn && _canSave ? _save : null,
                ),
                const SizedBox(height: AppSpacing.sm),
                AppButton(
                  label: l10n.authSignOut,
                  variant: AppButtonVariant.secondary,
                  icon: Icons.logout,
                  onPressed: _saving ? null : _signOut,
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
          ),
        ),
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
          decoration: BoxDecoration(
            color: colors.primary,
            shape: BoxShape.circle,
          ),
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
            child: Icon(
              Icons.photo_camera_outlined,
              size: 18,
              color: colors.textSecondary,
            ),
          ),
        ),
      ],
    );
  }
}
