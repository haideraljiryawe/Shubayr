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
  String get actionDelete => 'Delete';

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
  String get accountGuestPrompt =>
      'Sign in to reach your cart, orders and loyalty points.';

  @override
  String get accountPreferences => 'Preferences';

  @override
  String get accountSupport => 'Help & support';

  @override
  String get accountHelp => 'Help';

  @override
  String get accountPrivacy => 'Privacy policy';

  @override
  String get accountTheme => 'Appearance';

  @override
  String get accountThemeSystem => 'System';

  @override
  String get accountThemeLight => 'Light';

  @override
  String get accountThemeDark => 'Dark';

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
  String get categoriesBrowseAll => 'Browse all';

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
  String get commonOutOfStock => 'Out of stock';

  @override
  String get homeSectionDepartments => 'Shop by department';

  @override
  String get homeAllDepartments => 'All';

  @override
  String get homeSectionProducts => 'Products';

  @override
  String get productDescription => 'Description';

  @override
  String get productNegotiable => 'Negotiable';

  @override
  String get productAddToCart => 'Add to cart';

  @override
  String get productReviewsSoon => 'Reviews are coming soon.';

  @override
  String get searchHint => 'Search products';

  @override
  String get searchNoResults => 'No matching products.';

  @override
  String get sortNewest => 'Newest';

  @override
  String get sortCheapest => 'Lowest price';

  @override
  String get sortDearest => 'Highest price';

  @override
  String get sortTopRated => 'Top rated';

  @override
  String get filtersTitle => 'Filters';

  @override
  String get filterPrice => 'Price';

  @override
  String get filterMin => 'Min';

  @override
  String get filterMax => 'Max';

  @override
  String get filterApply => 'Apply';

  @override
  String get filterClear => 'Clear';

  @override
  String get adminSectionCatalog => 'Catalog';

  @override
  String get adminSectionOrders => 'Orders';

  @override
  String get adminSectionInventory => 'Inventory';

  @override
  String get adminSectionPicking => 'Picking';

  @override
  String get adminSectionPurchasing => 'Purchasing';

  @override
  String get adminSectionReturns => 'Returns';

  @override
  String get adminSectionReports => 'Reports';

  @override
  String get adminSectionUsers => 'Users & roles';

  @override
  String get adminSectionSettings => 'Settings';

  @override
  String get adminNoAccess => 'No permissions are assigned to your account.';

  @override
  String get profileTitle => 'Profile';

  @override
  String get profileName => 'Name';

  @override
  String get profileNameRequired => 'Enter your name.';

  @override
  String get profileChangePhoto => 'Change photo';

  @override
  String get profileSaved => 'Changes saved.';

  @override
  String get profileDeleteAccount => 'Delete account';

  @override
  String get profileDeleteTitle => 'Delete account?';

  @override
  String get profileDeleteMessage =>
      'Your account and its data will be permanently deleted. This cannot be undone.';

  @override
  String galleryCounter(String current, String total) {
    return '$current of $total';
  }

  @override
  String get routeNotFoundTitle => 'Page not found';
}
