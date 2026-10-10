import '../../../../core/widgets/app_text_selection_toolbar.dart';
import '../../../../core/utils/numeric_input_formatters.dart';
import '../../../../core/layout/app_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/error/response_decode.dart';
import '../../../../core/storage/session_credentials.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/user_avatar.dart';
import '../providers/auth_providers.dart';

/// Step 1 of the OTP flow — `POST /auth/request-otp`.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key, this.returnTo});

  final String? returnTo;

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();
  bool _isSubmitting = false;
  String? _errorMessage;

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  /// Returns the guest to what they were browsing.
  ///
  /// Normally there is history to pop: tapping Account from the shell pushes
  /// this screen over the customer area. The fallback covers the paths that
  /// arrive here by redirect instead of by push — a deep link to a private
  /// route, or a session expiring — where popping is not possible and the
  /// guest would otherwise be stuck.
  void _goBack(BuildContext context) {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.home);
    }
  }

  Future<void> _submit() async {
    if (_isSubmitting) return;
    final credentials = ref.read(sessionCredentialsProvider);
    final owner = credentials.revision;
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final phone = Validators.normalizePhone(_phoneController.text);

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });
    try {
      await ref.read(sessionControllerProvider.notifier).requestOtp(phone);
      if (!mounted || !credentials.owns(owner)) return;
      context.pushNamed(
        AppRoutes.verifyOtpName,
        queryParameters: {'phone': phone, 'returnTo': ?widget.returnTo},
      );
    } catch (error, stack) {
      final failure = actionFailure(error, stack);
      if (!mounted || !credentials.owns(owner)) return;
      setState(() => _errorMessage = failure.localizedMessage(context.l10n));
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.colors;

    return Scaffold(
      appBar: AppBar(
        // Material's BackButton picks the platform glyph (arrow_back_ios_new
        // on iOS, arrow_back elsewhere) and every one of those icons declares
        // matchTextDirection, so the arrow flips itself in Arabic — nothing
        // direction-specific is hard-coded here.
        leading: BackButton(onPressed: () => _goBack(context)),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: AppLayout.pageInsets(
              context,
              top: AppSpacing.xl,
              bottom: AppSpacing.xl,
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: AppLayout.authWidth),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Center(
                      child: SizedBox.square(
                        dimension: AppSpacing.xxl * 2,
                        child: FittedBox(child: UserAvatar()),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    Text(
                      l10n.authSignInTitle,
                      style: context.text.headlineSmall,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      l10n.authSignInSubtitle,
                      style: context.text.bodyMedium?.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    TextFormField(
                      contextMenuBuilder: appTextSelectionToolbar,
                      controller: _phoneController,
                      keyboardType: TextInputType.phone,
                      inputFormatters: const [PhoneInputFormatter()],
                      textDirection: TextDirection.ltr,
                      autofillHints: const [AutofillHints.telephoneNumber],
                      decoration: InputDecoration(
                        labelText: l10n.authPhoneLabel,
                        hintText: l10n.authPhoneHint,
                        prefixIcon: const Icon(Icons.phone_outlined),
                      ),
                      validator: (value) => Validators.isPhone(value ?? '')
                          ? null
                          : l10n.authPhoneInvalid,
                      onFieldSubmitted: (_) => _submit(),
                    ),
                    if (_errorMessage != null) ...[
                      const SizedBox(height: AppSpacing.md),
                      Text(
                        _errorMessage!,
                        style: context.text.bodySmall?.copyWith(
                          color: colors.danger,
                        ),
                      ),
                    ],
                    const SizedBox(height: AppSpacing.xl),
                    AppButton(
                      label: l10n.authSendCode,
                      isLoading: _isSubmitting,
                      onPressed: _submit,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
