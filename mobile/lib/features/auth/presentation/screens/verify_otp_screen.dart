import '../../../../core/utils/numeric_input_formatters.dart';
import '../../../../core/layout/app_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/sign_in_destination.dart';
import '../../../../app/router/app_routes.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/widgets/app_button.dart';
import '../providers/auth_providers.dart';

/// Step 2 of the OTP flow — `POST /auth/verify-otp`.
///
/// On success, clears the authentication stack and restores a validated
/// customer destination, or the appropriate home for another role.
class VerifyOtpScreen extends ConsumerStatefulWidget {
  const VerifyOtpScreen({super.key, required this.phone, this.returnTo});

  final String phone;
  final String? returnTo;

  @override
  ConsumerState<VerifyOtpScreen> createState() => _VerifyOtpScreenState();
}

class _VerifyOtpScreenState extends ConsumerState<VerifyOtpScreen> {
  final _formKey = GlobalKey<FormState>();
  final _codeController = TextEditingController();
  bool _isSubmitting = false;
  String? _errorMessage;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });
    try {
      await action();
    } on AppFailure catch (failure) {
      if (!mounted) return;
      setState(() => _errorMessage = failure.localizedMessage(context.l10n));
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  Future<void> _verify() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    await _run(
      () => ref
          .read(sessionControllerProvider.notifier)
          .verifyOtp(
            phone: widget.phone,
            code: Validators.foldDigits(_codeController.text).trim(),
          ),
    );

    // On success, reset the stack with a clean declarative navigation. The
    // sign-in and verify screens are reached by imperative `push`; letting the
    // session-change redirect fire on top of those pushed pages made go_router
    // rebuild the navigator with a duplicated shell page key and crash. Going
    // to a root page clears those matches before restoring a detail page.
    if (!mounted) return;
    final session = ref.read(sessionControllerProvider).value;
    if (session != null && session.isSignedIn) {
      final router = GoRouter.of(context);
      final destination = SignInDestination.resolve(
        widget.returnTo,
        session.role,
      );
      const rootPages = {
        AppRoutes.home,
        AppRoutes.categories,
        AppRoutes.account,
        AppRoutes.cart,
        AppRoutes.orders,
        AppRoutes.delivery,
        AppRoutes.monitor,
      };
      if (rootPages.contains(Uri.parse(destination).path)) {
        router.go(destination);
      } else {
        // Full-screen routes need a customer shell underneath them so Back
        // remains available after clearing the authentication stack.
        router.go(AppRoutes.home);
        router.push(destination);
      }
    }
  }

  Future<void> _resend() => _run(
    () => ref.read(sessionControllerProvider.notifier).requestOtp(widget.phone),
  );

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.colors;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.authVerifyTitle)),
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
                    Text(
                      l10n.authVerifySubtitle(widget.phone),
                      style: context.text.bodyMedium?.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    TextFormField(
                      controller: _codeController,
                      keyboardType: TextInputType.number,
                      inputFormatters: const [OtpInputFormatter()],
                      textDirection: TextDirection.ltr,
                      autofillHints: const [AutofillHints.oneTimeCode],
                      decoration: InputDecoration(
                        labelText: l10n.authCodeLabel,
                        prefixIcon: const Icon(Icons.lock_outline),
                      ),
                      validator: (value) => Validators.isOtp(value ?? '')
                          ? null
                          : l10n.authCodeInvalid,
                      onFieldSubmitted: (_) => _verify(),
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
                      label: l10n.authVerify,
                      isLoading: _isSubmitting,
                      onPressed: _verify,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    AppButton(
                      label: l10n.authResendCode,
                      variant: AppButtonVariant.plain,
                      onPressed: _isSubmitting ? null : _resend,
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
