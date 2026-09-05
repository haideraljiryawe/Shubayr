// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get storeFallbackName => 'Store';

  @override
  String get actionRetry => 'Retry';

  @override
  String get actionCancel => 'Cancel';

  @override
  String get actionContinue => 'Continue';

  @override
  String get actionSave => 'Save';

  @override
  String get actionClose => 'Close';

  @override
  String get navHome => 'Home';

  @override
  String get navCategories => 'Categories';

  @override
  String get navCart => 'Cart';

  @override
  String get navOrders => 'Orders';

  @override
  String get navAccount => 'Account';

  @override
  String get stateLoading => 'Loading…';

  @override
  String get stateEmptyTitle => 'Nothing here yet';

  @override
  String get stateEmptyMessage =>
      'Once there is something to show, it will appear here.';

  @override
  String get stateErrorTitle => 'Something went wrong';

  @override
  String get errorNetwork =>
      'No internet connection. Check your network and try again.';

  @override
  String get errorTimeout => 'The request took too long. Please try again.';

  @override
  String get errorServer => 'The server could not complete the request.';

  @override
  String get errorUnauthorized =>
      'Your session has expired. Please sign in again.';

  @override
  String get errorNotFound => 'We could not find what you were looking for.';

  @override
  String get errorValidation => 'Please check the information you entered.';

  @override
  String get errorRateLimited =>
      'Too many attempts. Please wait a moment and try again.';

  @override
  String get errorUnknown => 'An unexpected error occurred.';

  @override
  String get authSignInTitle => 'Sign in';

  @override
  String get authSignInSubtitle =>
      'Enter your phone number and we will send you a verification code.';

  @override
  String get authPhoneLabel => 'Phone number';

  @override
  String get authPhoneHint => '+964 770 000 0000';

  @override
  String get authPhoneInvalid => 'Enter a valid phone number.';

  @override
  String get authSendCode => 'Send code';

  @override
  String get authVerifyTitle => 'Verification code';

  @override
  String authVerifySubtitle(String phone) {
    return 'We sent a 6-digit code to $phone.';
  }

  @override
  String get authCodeLabel => 'Verification code';

  @override
  String get authCodeInvalid => 'Enter the 6-digit code.';

  @override
  String get authVerify => 'Verify';

  @override
  String get authResendCode => 'Resend code';

  @override
  String get authSignOut => 'Sign out';

  @override
  String get authGuest => 'Guest';

  @override
  String get accountTitle => 'Account';

  @override
  String get accountLanguage => 'Language';

  @override
  String get accountLanguageArabic => 'العربية';

  @override
  String get accountLanguageEnglish => 'English';

  @override
  String get accountCurrency => 'Currency';

  @override
  String accountSignedInAs(String role) {
    return 'Signed in as $role';
  }

  @override
  String get roleCustomer => 'Customer';

  @override
  String get roleDelivery => 'Delivery agent';

  @override
  String get roleStaff => 'Staff';

  @override
  String get homeTitle => 'Home';

  @override
  String get categoriesTitle => 'Categories';

  @override
  String get cartTitle => 'Cart';

  @override
  String get ordersTitle => 'Orders';

  @override
  String get deliveryTitle => 'Deliveries';

  @override
  String get adminTitle => 'Dashboard';

  @override
  String get comingSoonTitle => 'Coming soon';

  @override
  String get comingSoonMessage => 'This part of the app is not built yet.';

  @override
  String get routeNotFoundTitle => 'Page not found';
}
