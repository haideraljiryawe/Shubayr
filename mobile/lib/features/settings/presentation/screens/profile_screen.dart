import '../../../../core/widgets/work_app_bar.dart';
import '../../../../core/layout/app_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/error/failure.dart';
import '../../../auth/data/user.dart';
import '../../../auth/domain/profile_update.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/user_avatar.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../auth/presentation/providers/auth_providers.dart';

/// The signed-in user's profile editor.
///
/// Shared identity editor for every role. Account actions live in AccountView.
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
      appBar: workAppBar(context, ref, title: l10n.accountEditProfile),
      body: ResponsiveContent(
        child: Form(
          key: _form,
          child: SingleChildScrollView(
            padding: AppLayout.pageInsets(context),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: AppSpacing.md),
                const Center(child: UserAvatar()),
                const SizedBox(height: AppSpacing.sm),
                Center(
                  child: AppButton(
                    variant: AppButtonVariant.secondary,
                    expand: false,
                    onPressed: () => showAppSnackBarMessage(
                      context,
                      message: l10n.comingSoonTitle,
                    ),
                    icon: Icons.photo_camera_outlined,
                    label: l10n.profileChangePhoto,
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
                const SizedBox(height: AppSpacing.lg),
                Text(l10n.profilePhone, style: context.text.titleSmall),
                Wrap(
                  spacing: AppSpacing.md,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      _initialUser?.phone?.trim().isNotEmpty != true
                          ? l10n.accountNoPhone
                          : Validators.foldDigits(_initialUser!.phone!),
                      textDirection: TextDirection.ltr,
                      style: context.text.bodyLarge,
                    ),
                    TextButton(
                      key: const ValueKey('profile-change-phone'),
                      onPressed: signedIn && !_saving
                          ? () => showAppSnackBarMessage(
                              context,
                              message: l10n.profilePhoneChangeUnavailable,
                            )
                          : null,
                      child: Text(l10n.profileChangePhone),
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
              ],
            ),
          ),
        ),
      ),
    );
  }
}
