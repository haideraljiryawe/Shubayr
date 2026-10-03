import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_ar.dart';
import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'generated/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('ar'),
    Locale('en'),
  ];

  /// No description provided for @homeBrandName.
  ///
  /// In en, this message translates to:
  /// **'Shubayr'**
  String get homeBrandName;

  /// Neutral brand name used before store settings load.
  ///
  /// In en, this message translates to:
  /// **'Store'**
  String get storeFallbackName;

  /// No description provided for @actionRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get actionRetry;

  /// No description provided for @actionCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get actionCancel;

  /// No description provided for @actionContinue.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get actionContinue;

  /// No description provided for @actionSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get actionSave;

  /// No description provided for @actionClose.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get actionClose;

  /// No description provided for @actionDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get actionDelete;

  /// No description provided for @navHome.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHome;

  /// No description provided for @navCategories.
  ///
  /// In en, this message translates to:
  /// **'Categories'**
  String get navCategories;

  /// No description provided for @navCart.
  ///
  /// In en, this message translates to:
  /// **'Cart'**
  String get navCart;

  /// No description provided for @navOrders.
  ///
  /// In en, this message translates to:
  /// **'Orders'**
  String get navOrders;

  /// No description provided for @navAccount.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get navAccount;

  /// No description provided for @stateLoading.
  ///
  /// In en, this message translates to:
  /// **'Loading…'**
  String get stateLoading;

  /// No description provided for @stateEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'Nothing here yet'**
  String get stateEmptyTitle;

  /// No description provided for @stateEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Once there is something to show, it will appear here.'**
  String get stateEmptyMessage;

  /// No description provided for @stateErrorTitle.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong'**
  String get stateErrorTitle;

  /// No description provided for @errorNetwork.
  ///
  /// In en, this message translates to:
  /// **'Could not connect to the server. Check your connection and try again.'**
  String get errorNetwork;

  /// No description provided for @errorTimeout.
  ///
  /// In en, this message translates to:
  /// **'The request took too long. Please try again.'**
  String get errorTimeout;

  /// No description provided for @errorServer.
  ///
  /// In en, this message translates to:
  /// **'The server could not complete the request.'**
  String get errorServer;

  /// No description provided for @errorUnauthorized.
  ///
  /// In en, this message translates to:
  /// **'Your session has expired. Please sign in again.'**
  String get errorUnauthorized;

  /// No description provided for @errorNotFound.
  ///
  /// In en, this message translates to:
  /// **'We could not find what you were looking for.'**
  String get errorNotFound;

  /// No description provided for @errorValidation.
  ///
  /// In en, this message translates to:
  /// **'Please check the information you entered.'**
  String get errorValidation;

  /// No description provided for @errorRateLimited.
  ///
  /// In en, this message translates to:
  /// **'Too many attempts. Please wait a moment and try again.'**
  String get errorRateLimited;

  /// No description provided for @errorUnknown.
  ///
  /// In en, this message translates to:
  /// **'An unexpected error occurred.'**
  String get errorUnknown;

  /// No description provided for @authSignInTitle.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get authSignInTitle;

  /// No description provided for @authSignInSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Enter your phone number and we will send you a verification code.'**
  String get authSignInSubtitle;

  /// No description provided for @authPhoneLabel.
  ///
  /// In en, this message translates to:
  /// **'Phone number'**
  String get authPhoneLabel;

  /// No description provided for @authPhoneHint.
  ///
  /// In en, this message translates to:
  /// **'+964 770 000 0000'**
  String get authPhoneHint;

  /// No description provided for @authPhoneInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid phone number.'**
  String get authPhoneInvalid;

  /// No description provided for @authSendCode.
  ///
  /// In en, this message translates to:
  /// **'Send code'**
  String get authSendCode;

  /// No description provided for @authVerifyTitle.
  ///
  /// In en, this message translates to:
  /// **'Verification code'**
  String get authVerifyTitle;

  /// No description provided for @authVerifySubtitle.
  ///
  /// In en, this message translates to:
  /// **'We sent a 6-digit code to {phone}.'**
  String authVerifySubtitle(String phone);

  /// No description provided for @authCodeLabel.
  ///
  /// In en, this message translates to:
  /// **'Verification code'**
  String get authCodeLabel;

  /// No description provided for @authCodeInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter the 6-digit code.'**
  String get authCodeInvalid;

  /// No description provided for @authVerify.
  ///
  /// In en, this message translates to:
  /// **'Verify'**
  String get authVerify;

  /// No description provided for @authResendCode.
  ///
  /// In en, this message translates to:
  /// **'Resend code'**
  String get authResendCode;

  /// No description provided for @authSignOut.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get authSignOut;

  /// No description provided for @authGuest.
  ///
  /// In en, this message translates to:
  /// **'Guest'**
  String get authGuest;

  /// No description provided for @accountTitle.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get accountTitle;

  /// No description provided for @accountLanguage.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get accountLanguage;

  /// No description provided for @accountLanguageArabic.
  ///
  /// In en, this message translates to:
  /// **'العربية'**
  String get accountLanguageArabic;

  /// No description provided for @accountLanguageEnglish.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get accountLanguageEnglish;

  /// No description provided for @accountCurrency.
  ///
  /// In en, this message translates to:
  /// **'Currency'**
  String get accountCurrency;

  /// No description provided for @accountGuestPrompt.
  ///
  /// In en, this message translates to:
  /// **'Sign in to reach your cart, orders and loyalty points.'**
  String get accountGuestPrompt;

  /// No description provided for @accountPreferences.
  ///
  /// In en, this message translates to:
  /// **'Preferences'**
  String get accountPreferences;

  /// No description provided for @accountSupport.
  ///
  /// In en, this message translates to:
  /// **'Help & support'**
  String get accountSupport;

  /// No description provided for @accountHelp.
  ///
  /// In en, this message translates to:
  /// **'Help'**
  String get accountHelp;

  /// No description provided for @accountPrivacy.
  ///
  /// In en, this message translates to:
  /// **'Privacy policy'**
  String get accountPrivacy;

  /// No description provided for @accountTheme.
  ///
  /// In en, this message translates to:
  /// **'Appearance'**
  String get accountTheme;

  /// No description provided for @accountThemeSystem.
  ///
  /// In en, this message translates to:
  /// **'System'**
  String get accountThemeSystem;

  /// No description provided for @accountThemeLight.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get accountThemeLight;

  /// No description provided for @accountThemeDark.
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get accountThemeDark;

  /// No description provided for @accountSignedInAs.
  ///
  /// In en, this message translates to:
  /// **'Signed in as {role}'**
  String accountSignedInAs(String role);

  /// No description provided for @roleCustomer.
  ///
  /// In en, this message translates to:
  /// **'Customer'**
  String get roleCustomer;

  /// No description provided for @roleDelivery.
  ///
  /// In en, this message translates to:
  /// **'Delivery agent'**
  String get roleDelivery;

  /// No description provided for @roleStaff.
  ///
  /// In en, this message translates to:
  /// **'Staff'**
  String get roleStaff;

  /// No description provided for @homeTitle.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get homeTitle;

  /// No description provided for @categoriesTitle.
  ///
  /// In en, this message translates to:
  /// **'Categories'**
  String get categoriesTitle;

  /// No description provided for @categoriesBrowseAll.
  ///
  /// In en, this message translates to:
  /// **'Browse all'**
  String get categoriesBrowseAll;

  /// No description provided for @cartTitle.
  ///
  /// In en, this message translates to:
  /// **'Cart'**
  String get cartTitle;

  /// No description provided for @cartEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'Your cart is empty'**
  String get cartEmptyTitle;

  /// No description provided for @cartEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Add products to start shopping.'**
  String get cartEmptyMessage;

  /// No description provided for @cartSubtotal.
  ///
  /// In en, this message translates to:
  /// **'Subtotal'**
  String get cartSubtotal;

  /// No description provided for @cartCheckout.
  ///
  /// In en, this message translates to:
  /// **'Checkout'**
  String get cartCheckout;

  /// No description provided for @cartRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get cartRemove;

  /// No description provided for @cartAdded.
  ///
  /// In en, this message translates to:
  /// **'Added to cart'**
  String get cartAdded;

  /// No description provided for @cartViewCart.
  ///
  /// In en, this message translates to:
  /// **'View cart'**
  String get cartViewCart;

  /// No description provided for @cartSignInPrompt.
  ///
  /// In en, this message translates to:
  /// **'Sign in to add to cart'**
  String get cartSignInPrompt;

  /// No description provided for @addressesTitle.
  ///
  /// In en, this message translates to:
  /// **'Addresses'**
  String get addressesTitle;

  /// No description provided for @addressAdd.
  ///
  /// In en, this message translates to:
  /// **'Add address'**
  String get addressAdd;

  /// No description provided for @addressEdit.
  ///
  /// In en, this message translates to:
  /// **'Edit address'**
  String get addressEdit;

  /// No description provided for @addressEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No saved addresses'**
  String get addressEmptyTitle;

  /// No description provided for @addressEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Add a delivery address to speed up checkout.'**
  String get addressEmptyMessage;

  /// No description provided for @addressLabel.
  ///
  /// In en, this message translates to:
  /// **'Label'**
  String get addressLabel;

  /// No description provided for @addressCity.
  ///
  /// In en, this message translates to:
  /// **'City'**
  String get addressCity;

  /// No description provided for @addressArea.
  ///
  /// In en, this message translates to:
  /// **'Area'**
  String get addressArea;

  /// No description provided for @addressStreet.
  ///
  /// In en, this message translates to:
  /// **'Street'**
  String get addressStreet;

  /// No description provided for @addressDetails.
  ///
  /// In en, this message translates to:
  /// **'More details'**
  String get addressDetails;

  /// No description provided for @addressCityRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter the city.'**
  String get addressCityRequired;

  /// No description provided for @addressSetDefault.
  ///
  /// In en, this message translates to:
  /// **'Set as default'**
  String get addressSetDefault;

  /// No description provided for @addressDefault.
  ///
  /// In en, this message translates to:
  /// **'Default'**
  String get addressDefault;

  /// No description provided for @addressDeleteTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete this address?'**
  String get addressDeleteTitle;

  /// No description provided for @checkoutTitle.
  ///
  /// In en, this message translates to:
  /// **'Checkout'**
  String get checkoutTitle;

  /// No description provided for @checkoutAddress.
  ///
  /// In en, this message translates to:
  /// **'Delivery address'**
  String get checkoutAddress;

  /// No description provided for @checkoutChangeAddress.
  ///
  /// In en, this message translates to:
  /// **'Change'**
  String get checkoutChangeAddress;

  /// No description provided for @checkoutCoupon.
  ///
  /// In en, this message translates to:
  /// **'Discount coupon'**
  String get checkoutCoupon;

  /// No description provided for @checkoutCouponHint.
  ///
  /// In en, this message translates to:
  /// **'Enter code'**
  String get checkoutCouponHint;

  /// No description provided for @checkoutCouponInvalid.
  ///
  /// In en, this message translates to:
  /// **'Invalid coupon code'**
  String get checkoutCouponInvalid;

  /// No description provided for @checkoutDiscount.
  ///
  /// In en, this message translates to:
  /// **'Discount'**
  String get checkoutDiscount;

  /// No description provided for @checkoutDelivery.
  ///
  /// In en, this message translates to:
  /// **'Delivery fee'**
  String get checkoutDelivery;

  /// No description provided for @checkoutDeliveryNote.
  ///
  /// In en, this message translates to:
  /// **'Calculated at confirmation'**
  String get checkoutDeliveryNote;

  /// No description provided for @checkoutTotal.
  ///
  /// In en, this message translates to:
  /// **'Total'**
  String get checkoutTotal;

  /// No description provided for @checkoutPayment.
  ///
  /// In en, this message translates to:
  /// **'Payment method'**
  String get checkoutPayment;

  /// No description provided for @checkoutCod.
  ///
  /// In en, this message translates to:
  /// **'Cash on delivery'**
  String get checkoutCod;

  /// No description provided for @checkoutPlaceOrder.
  ///
  /// In en, this message translates to:
  /// **'Place order'**
  String get checkoutPlaceOrder;

  /// No description provided for @checkoutSuccessTitle.
  ///
  /// In en, this message translates to:
  /// **'Order placed'**
  String get checkoutSuccessTitle;

  /// No description provided for @checkoutSuccessMessage.
  ///
  /// In en, this message translates to:
  /// **'The courier will contact you to confirm delivery.'**
  String get checkoutSuccessMessage;

  /// No description provided for @checkoutOrderNumber.
  ///
  /// In en, this message translates to:
  /// **'Order number'**
  String get checkoutOrderNumber;

  /// No description provided for @checkoutBackHome.
  ///
  /// In en, this message translates to:
  /// **'Back to shopping'**
  String get checkoutBackHome;

  /// No description provided for @checkoutViewOrders.
  ///
  /// In en, this message translates to:
  /// **'View my orders'**
  String get checkoutViewOrders;

  /// No description provided for @wishlistTitle.
  ///
  /// In en, this message translates to:
  /// **'Wishlist'**
  String get wishlistTitle;

  /// No description provided for @wishlistEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No saved products'**
  String get wishlistEmptyTitle;

  /// No description provided for @wishlistEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Save products you like to find them here.'**
  String get wishlistEmptyMessage;

  /// No description provided for @wishlistAdd.
  ///
  /// In en, this message translates to:
  /// **'Add to wishlist'**
  String get wishlistAdd;

  /// No description provided for @wishlistRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove from wishlist'**
  String get wishlistRemove;

  /// No description provided for @wishlistSignInPrompt.
  ///
  /// In en, this message translates to:
  /// **'Sign in to save to your wishlist'**
  String get wishlistSignInPrompt;

  /// No description provided for @ordersTitle.
  ///
  /// In en, this message translates to:
  /// **'Orders'**
  String get ordersTitle;

  /// No description provided for @ordersEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No orders yet'**
  String get ordersEmptyTitle;

  /// No description provided for @ordersEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Start shopping and your orders will appear here.'**
  String get ordersEmptyMessage;

  /// No description provided for @ordersFilterAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get ordersFilterAll;

  /// No description provided for @ordersFilterEmpty.
  ///
  /// In en, this message translates to:
  /// **'No orders with this status'**
  String get ordersFilterEmpty;

  /// Item count on an order card; count is a string so it stays Western-Arabic.
  ///
  /// In en, this message translates to:
  /// **'{count} items'**
  String orderItemsCount(String count);

  /// No description provided for @orderDetailTitle.
  ///
  /// In en, this message translates to:
  /// **'Order details'**
  String get orderDetailTitle;

  /// No description provided for @orderItemsSection.
  ///
  /// In en, this message translates to:
  /// **'Items'**
  String get orderItemsSection;

  /// Quantity of an order line; count is a string so it stays Western-Arabic.
  ///
  /// In en, this message translates to:
  /// **'Qty: {count}'**
  String orderLineQuantity(String count);

  /// No description provided for @orderSummary.
  ///
  /// In en, this message translates to:
  /// **'Order summary'**
  String get orderSummary;

  /// No description provided for @orderDate.
  ///
  /// In en, this message translates to:
  /// **'Order date'**
  String get orderDate;

  /// No description provided for @orderTrackingTitle.
  ///
  /// In en, this message translates to:
  /// **'Order tracking'**
  String get orderTrackingTitle;

  /// No description provided for @orderCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel order'**
  String get orderCancel;

  /// No description provided for @orderCancelTitle.
  ///
  /// In en, this message translates to:
  /// **'Cancel this order?'**
  String get orderCancelTitle;

  /// No description provided for @orderCancelMessage.
  ///
  /// In en, this message translates to:
  /// **'This can\'t be undone once cancelled.'**
  String get orderCancelMessage;

  /// No description provided for @orderKeepOrder.
  ///
  /// In en, this message translates to:
  /// **'Keep order'**
  String get orderKeepOrder;

  /// No description provided for @orderCancelledDone.
  ///
  /// In en, this message translates to:
  /// **'Order cancelled.'**
  String get orderCancelledDone;

  /// No description provided for @orderStatusPending.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get orderStatusPending;

  /// No description provided for @orderStatusConfirmed.
  ///
  /// In en, this message translates to:
  /// **'Confirmed'**
  String get orderStatusConfirmed;

  /// No description provided for @orderStatusProcessing.
  ///
  /// In en, this message translates to:
  /// **'Processing'**
  String get orderStatusProcessing;

  /// No description provided for @orderStatusOutForDelivery.
  ///
  /// In en, this message translates to:
  /// **'Out for delivery'**
  String get orderStatusOutForDelivery;

  /// No description provided for @orderStatusDelivered.
  ///
  /// In en, this message translates to:
  /// **'Delivered'**
  String get orderStatusDelivered;

  /// No description provided for @orderStatusFailedDelivery.
  ///
  /// In en, this message translates to:
  /// **'Delivery failed'**
  String get orderStatusFailedDelivery;

  /// No description provided for @orderStatusRejected.
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get orderStatusRejected;

  /// No description provided for @orderStatusCancelled.
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get orderStatusCancelled;

  /// No description provided for @orderStatusReturnRequested.
  ///
  /// In en, this message translates to:
  /// **'Return requested'**
  String get orderStatusReturnRequested;

  /// No description provided for @orderStatusReturned.
  ///
  /// In en, this message translates to:
  /// **'Returned'**
  String get orderStatusReturned;

  /// No description provided for @deliveryFilterAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get deliveryFilterAll;

  /// No description provided for @deliveryFilterEmpty.
  ///
  /// In en, this message translates to:
  /// **'No deliveries with this status'**
  String get deliveryFilterEmpty;

  /// No description provided for @deliveryStatusConflict.
  ///
  /// In en, this message translates to:
  /// **'The current state does not allow this action. Check the delivery and order status before trying again.'**
  String get deliveryStatusConflict;

  /// No description provided for @deliveryTitle.
  ///
  /// In en, this message translates to:
  /// **'Deliveries'**
  String get deliveryTitle;

  /// No description provided for @adminTitle.
  ///
  /// In en, this message translates to:
  /// **'Dashboard'**
  String get adminTitle;

  /// No description provided for @comingSoonTitle.
  ///
  /// In en, this message translates to:
  /// **'Coming soon'**
  String get comingSoonTitle;

  /// No description provided for @comingSoonMessage.
  ///
  /// In en, this message translates to:
  /// **'This part of the app is not built yet.'**
  String get comingSoonMessage;

  /// No description provided for @commonOutOfStock.
  ///
  /// In en, this message translates to:
  /// **'Out of stock'**
  String get commonOutOfStock;

  /// No description provided for @homeSectionDepartments.
  ///
  /// In en, this message translates to:
  /// **'Shop by department'**
  String get homeSectionDepartments;

  /// No description provided for @homeAllDepartments.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get homeAllDepartments;

  /// No description provided for @homeOffersTitle.
  ///
  /// In en, this message translates to:
  /// **'Offers & Discounts'**
  String get homeOffersTitle;

  /// No description provided for @homeOffersViewAll.
  ///
  /// In en, this message translates to:
  /// **'View all'**
  String get homeOffersViewAll;

  /// No description provided for @homeSectionProducts.
  ///
  /// In en, this message translates to:
  /// **'Products'**
  String get homeSectionProducts;

  /// No description provided for @productDescription.
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get productDescription;

  /// No description provided for @productNegotiable.
  ///
  /// In en, this message translates to:
  /// **'Negotiable'**
  String get productNegotiable;

  /// No description provided for @productAddToCart.
  ///
  /// In en, this message translates to:
  /// **'Add to cart'**
  String get productAddToCart;

  /// No description provided for @productVariants.
  ///
  /// In en, this message translates to:
  /// **'Options'**
  String get productVariants;

  /// No description provided for @productQuantity.
  ///
  /// In en, this message translates to:
  /// **'Quantity'**
  String get productQuantity;

  /// No description provided for @productInStock.
  ///
  /// In en, this message translates to:
  /// **'In stock'**
  String get productInStock;

  /// Low-stock hint on product detail; count is passed as a string so it stays Western-Arabic.
  ///
  /// In en, this message translates to:
  /// **'Only {count} left'**
  String productLowStock(String count);

  /// No description provided for @productReviews.
  ///
  /// In en, this message translates to:
  /// **'Reviews'**
  String get productReviews;

  /// No description provided for @productNoReviews.
  ///
  /// In en, this message translates to:
  /// **'No reviews yet'**
  String get productNoReviews;

  /// Number of reviews shown in the product detail summary; count is a string to stay Western-Arabic.
  ///
  /// In en, this message translates to:
  /// **'{count} reviews'**
  String productReviewsCount(String count);

  /// No description provided for @productVerifiedPurchase.
  ///
  /// In en, this message translates to:
  /// **'Verified purchase'**
  String get productVerifiedPurchase;

  /// No description provided for @productReviewsSoon.
  ///
  /// In en, this message translates to:
  /// **'Reviews are coming soon.'**
  String get productReviewsSoon;

  /// No description provided for @searchHint.
  ///
  /// In en, this message translates to:
  /// **'Search products'**
  String get searchHint;

  /// No description provided for @searchNoResults.
  ///
  /// In en, this message translates to:
  /// **'No matching products.'**
  String get searchNoResults;

  /// No description provided for @sortNewest.
  ///
  /// In en, this message translates to:
  /// **'Newest'**
  String get sortNewest;

  /// No description provided for @sortCheapest.
  ///
  /// In en, this message translates to:
  /// **'Lowest price'**
  String get sortCheapest;

  /// No description provided for @sortDearest.
  ///
  /// In en, this message translates to:
  /// **'Highest price'**
  String get sortDearest;

  /// No description provided for @sortTopRated.
  ///
  /// In en, this message translates to:
  /// **'Top rated'**
  String get sortTopRated;

  /// No description provided for @productFiltersSort.
  ///
  /// In en, this message translates to:
  /// **'Sort by'**
  String get productFiltersSort;

  /// No description provided for @productFiltersOffersOnly.
  ///
  /// In en, this message translates to:
  /// **'Offers only'**
  String get productFiltersOffersOnly;

  /// No description provided for @productFiltersClearAll.
  ///
  /// In en, this message translates to:
  /// **'Clear all'**
  String get productFiltersClearAll;

  /// No description provided for @productFiltersShowResults.
  ///
  /// In en, this message translates to:
  /// **'Show results'**
  String get productFiltersShowResults;

  /// No description provided for @productFilterPriceRange.
  ///
  /// In en, this message translates to:
  /// **'Price: {min}–{max}'**
  String productFilterPriceRange(String min, String max);

  /// No description provided for @productFilterPriceFrom.
  ///
  /// In en, this message translates to:
  /// **'Price: from {min}'**
  String productFilterPriceFrom(String min);

  /// No description provided for @productFilterPriceTo.
  ///
  /// In en, this message translates to:
  /// **'Price: up to {max}'**
  String productFilterPriceTo(String max);

  /// No description provided for @filtersTitle.
  ///
  /// In en, this message translates to:
  /// **'Filters'**
  String get filtersTitle;

  /// No description provided for @filterPrice.
  ///
  /// In en, this message translates to:
  /// **'Price'**
  String get filterPrice;

  /// No description provided for @filterMin.
  ///
  /// In en, this message translates to:
  /// **'Min'**
  String get filterMin;

  /// No description provided for @filterMax.
  ///
  /// In en, this message translates to:
  /// **'Max'**
  String get filterMax;

  /// No description provided for @filterApply.
  ///
  /// In en, this message translates to:
  /// **'Apply'**
  String get filterApply;

  /// No description provided for @filterClear.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get filterClear;

  /// No description provided for @adminSectionCatalog.
  ///
  /// In en, this message translates to:
  /// **'Catalog'**
  String get adminSectionCatalog;

  /// No description provided for @adminSectionOrders.
  ///
  /// In en, this message translates to:
  /// **'Orders'**
  String get adminSectionOrders;

  /// No description provided for @adminSectionInventory.
  ///
  /// In en, this message translates to:
  /// **'Inventory'**
  String get adminSectionInventory;

  /// No description provided for @adminSectionPicking.
  ///
  /// In en, this message translates to:
  /// **'Picking'**
  String get adminSectionPicking;

  /// No description provided for @adminSectionPurchasing.
  ///
  /// In en, this message translates to:
  /// **'Purchasing'**
  String get adminSectionPurchasing;

  /// No description provided for @adminSectionReturns.
  ///
  /// In en, this message translates to:
  /// **'Returns'**
  String get adminSectionReturns;

  /// No description provided for @adminSectionReports.
  ///
  /// In en, this message translates to:
  /// **'Reports'**
  String get adminSectionReports;

  /// No description provided for @adminSectionUsers.
  ///
  /// In en, this message translates to:
  /// **'Users & roles'**
  String get adminSectionUsers;

  /// No description provided for @adminSectionSettings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get adminSectionSettings;

  /// No description provided for @adminNoAccess.
  ///
  /// In en, this message translates to:
  /// **'No permissions are assigned to your account.'**
  String get adminNoAccess;

  /// No description provided for @profileTitle.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get profileTitle;

  /// No description provided for @profileName.
  ///
  /// In en, this message translates to:
  /// **'Name'**
  String get profileName;

  /// No description provided for @profileEmail.
  ///
  /// In en, this message translates to:
  /// **'Email (optional)'**
  String get profileEmail;

  /// No description provided for @profileEmailInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid email, up to 160 characters.'**
  String get profileEmailInvalid;

  /// No description provided for @profileNameTooLong.
  ///
  /// In en, this message translates to:
  /// **'Use no more than 120 characters.'**
  String get profileNameTooLong;

  /// No description provided for @profileNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter your name.'**
  String get profileNameRequired;

  /// No description provided for @profileChangePhoto.
  ///
  /// In en, this message translates to:
  /// **'Change photo'**
  String get profileChangePhoto;

  /// No description provided for @profileSaved.
  ///
  /// In en, this message translates to:
  /// **'Changes saved.'**
  String get profileSaved;

  /// No description provided for @profileDeleteAccount.
  ///
  /// In en, this message translates to:
  /// **'Delete account'**
  String get profileDeleteAccount;

  /// No description provided for @profileDeleteTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete account?'**
  String get profileDeleteTitle;

  /// No description provided for @profileDeleteMessage.
  ///
  /// In en, this message translates to:
  /// **'Your account and its data will be permanently deleted. This cannot be undone.'**
  String get profileDeleteMessage;

  /// Image position in the full-screen product gallery, e.g. '1 of 5'. Digits are passed as strings so they stay Western Arabic numerals like the rest of the app.
  ///
  /// In en, this message translates to:
  /// **'{current} of {total}'**
  String galleryCounter(String current, String total);

  /// No description provided for @afterSalesDeliveredOnly.
  ///
  /// In en, this message translates to:
  /// **'These services are available after the order is delivered.'**
  String get afterSalesDeliveredOnly;

  /// No description provided for @reviewOrderTitle.
  ///
  /// In en, this message translates to:
  /// **'Review products'**
  String get reviewOrderTitle;

  /// No description provided for @reviewOrderHint.
  ///
  /// In en, this message translates to:
  /// **'Choose an item from this delivered order. Product reviews are separate from delivery ratings.'**
  String get reviewOrderHint;

  /// No description provided for @reviewChooseProduct.
  ///
  /// In en, this message translates to:
  /// **'Product to review'**
  String get reviewChooseProduct;

  /// No description provided for @reviewRating.
  ///
  /// In en, this message translates to:
  /// **'Your rating'**
  String get reviewRating;

  /// No description provided for @reviewStars.
  ///
  /// In en, this message translates to:
  /// **'{count} out of 5 stars'**
  String reviewStars(String count);

  /// No description provided for @reviewComment.
  ///
  /// In en, this message translates to:
  /// **'Comment (optional)'**
  String get reviewComment;

  /// No description provided for @reviewSubmit.
  ///
  /// In en, this message translates to:
  /// **'Submit review'**
  String get reviewSubmit;

  /// No description provided for @reviewSubmitted.
  ///
  /// In en, this message translates to:
  /// **'Review submitted. Publication is subject to review.'**
  String get reviewSubmitted;

  /// No description provided for @reviewAllSubmitted.
  ///
  /// In en, this message translates to:
  /// **'You have submitted reviews for all items in this session.'**
  String get reviewAllSubmitted;

  /// No description provided for @returnOrderTitle.
  ///
  /// In en, this message translates to:
  /// **'Request a return'**
  String get returnOrderTitle;

  /// No description provided for @returnOrderHint.
  ///
  /// In en, this message translates to:
  /// **'Choose quantities to return. Leave items you want to keep at 0.'**
  String get returnOrderHint;

  /// No description provided for @returnAvailable.
  ///
  /// In en, this message translates to:
  /// **'Quantity available to request: {count}'**
  String returnAvailable(String count);

  /// No description provided for @returnIncrease.
  ///
  /// In en, this message translates to:
  /// **'Increase return quantity'**
  String get returnIncrease;

  /// No description provided for @returnDecrease.
  ///
  /// In en, this message translates to:
  /// **'Decrease return quantity'**
  String get returnDecrease;

  /// No description provided for @returnReason.
  ///
  /// In en, this message translates to:
  /// **'Reason for return (optional)'**
  String get returnReason;

  /// No description provided for @returnSubmit.
  ///
  /// In en, this message translates to:
  /// **'Submit return request'**
  String get returnSubmit;

  /// No description provided for @returnSubmitted.
  ///
  /// In en, this message translates to:
  /// **'Return request submitted.'**
  String get returnSubmitted;

  /// No description provided for @returnReference.
  ///
  /// In en, this message translates to:
  /// **'Request reference: {id}'**
  String returnReference(String id);

  /// No description provided for @returnRequestOnly.
  ///
  /// In en, this message translates to:
  /// **'This is a request, not an approval or a refund. The store will review it.'**
  String get returnRequestOnly;

  /// No description provided for @returnAllRequested.
  ///
  /// In en, this message translates to:
  /// **'All item quantities have been requested for return in this session.'**
  String get returnAllRequested;

  /// No description provided for @routeNotFoundTitle.
  ///
  /// In en, this message translates to:
  /// **'Page not found'**
  String get routeNotFoundTitle;

  /// No description provided for @deliveryAssigned.
  ///
  /// In en, this message translates to:
  /// **'Assigned'**
  String get deliveryAssigned;

  /// No description provided for @deliveryOutForDelivery.
  ///
  /// In en, this message translates to:
  /// **'Out for delivery'**
  String get deliveryOutForDelivery;

  /// No description provided for @deliveryDelivered.
  ///
  /// In en, this message translates to:
  /// **'Delivered'**
  String get deliveryDelivered;

  /// No description provided for @deliveryFailed.
  ///
  /// In en, this message translates to:
  /// **'Delivery failed'**
  String get deliveryFailed;

  /// No description provided for @deliveryReturned.
  ///
  /// In en, this message translates to:
  /// **'Returned'**
  String get deliveryReturned;

  /// No description provided for @deliveryUnknownStatus.
  ///
  /// In en, this message translates to:
  /// **'Unknown status'**
  String get deliveryUnknownStatus;

  /// No description provided for @deliveryEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No assigned deliveries'**
  String get deliveryEmptyTitle;

  /// No description provided for @deliveryEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Your deliveries will appear here when assigned to you.'**
  String get deliveryEmptyMessage;

  /// No description provided for @deliveryNoAccess.
  ///
  /// In en, this message translates to:
  /// **'Your account does not have access to assigned deliveries.'**
  String get deliveryNoAccess;

  /// No description provided for @deliveryOrderId.
  ///
  /// In en, this message translates to:
  /// **'Order reference'**
  String get deliveryOrderId;

  /// No description provided for @deliveryFee.
  ///
  /// In en, this message translates to:
  /// **'Delivery fee'**
  String get deliveryFee;

  /// No description provided for @deliveryDispatchedAt.
  ///
  /// In en, this message translates to:
  /// **'Dispatched'**
  String get deliveryDispatchedAt;

  /// No description provided for @deliveryDeliveredAt.
  ///
  /// In en, this message translates to:
  /// **'Delivered'**
  String get deliveryDeliveredAt;

  /// No description provided for @deliveryUpdateStatus.
  ///
  /// In en, this message translates to:
  /// **'Update status'**
  String get deliveryUpdateStatus;

  /// No description provided for @deliverySelectStatus.
  ///
  /// In en, this message translates to:
  /// **'Choose a status'**
  String get deliverySelectStatus;

  /// No description provided for @deliveryStatusUpdated.
  ///
  /// In en, this message translates to:
  /// **'Delivery status updated'**
  String get deliveryStatusUpdated;

  /// No description provided for @adminProducts.
  ///
  /// In en, this message translates to:
  /// **'Products'**
  String get adminProducts;

  /// No description provided for @adminCategories.
  ///
  /// In en, this message translates to:
  /// **'Categories'**
  String get adminCategories;

  /// No description provided for @adminRoles.
  ///
  /// In en, this message translates to:
  /// **'Roles'**
  String get adminRoles;

  /// No description provided for @adminSuppliers.
  ///
  /// In en, this message translates to:
  /// **'Suppliers'**
  String get adminSuppliers;

  /// No description provided for @adminWarehouses.
  ///
  /// In en, this message translates to:
  /// **'Warehouses'**
  String get adminWarehouses;

  /// No description provided for @adminLocations.
  ///
  /// In en, this message translates to:
  /// **'Storage locations'**
  String get adminLocations;

  /// No description provided for @adminAdd.
  ///
  /// In en, this message translates to:
  /// **'Add'**
  String get adminAdd;

  /// No description provided for @adminEdit.
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get adminEdit;

  /// No description provided for @adminDeleteConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete this record?'**
  String get adminDeleteConfirm;

  /// No description provided for @adminArchiveConfirm.
  ///
  /// In en, this message translates to:
  /// **'Archive this product?'**
  String get adminArchiveConfirm;

  /// No description provided for @adminSaved.
  ///
  /// In en, this message translates to:
  /// **'Saved'**
  String get adminSaved;

  /// No description provided for @adminDeleted.
  ///
  /// In en, this message translates to:
  /// **'Deleted'**
  String get adminDeleted;

  /// No description provided for @adminEmpty.
  ///
  /// In en, this message translates to:
  /// **'No matching records'**
  String get adminEmpty;

  /// No description provided for @adminFieldName.
  ///
  /// In en, this message translates to:
  /// **'Name'**
  String get adminFieldName;

  /// No description provided for @adminFieldNameAr.
  ///
  /// In en, this message translates to:
  /// **'Arabic name'**
  String get adminFieldNameAr;

  /// No description provided for @adminFieldNameEn.
  ///
  /// In en, this message translates to:
  /// **'English name'**
  String get adminFieldNameEn;

  /// No description provided for @adminFieldPhone.
  ///
  /// In en, this message translates to:
  /// **'Phone'**
  String get adminFieldPhone;

  /// No description provided for @adminFieldEmail.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get adminFieldEmail;

  /// No description provided for @adminFieldAddress.
  ///
  /// In en, this message translates to:
  /// **'Address'**
  String get adminFieldAddress;

  /// No description provided for @adminFieldDescription.
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get adminFieldDescription;

  /// No description provided for @adminFieldPrice.
  ///
  /// In en, this message translates to:
  /// **'Sale price'**
  String get adminFieldPrice;

  /// No description provided for @adminFieldFloorPrice.
  ///
  /// In en, this message translates to:
  /// **'Negotiation floor price'**
  String get adminFieldFloorPrice;

  /// No description provided for @adminFieldPointsPrice.
  ///
  /// In en, this message translates to:
  /// **'Redemption points cost'**
  String get adminFieldPointsPrice;

  /// No description provided for @adminFieldIcon.
  ///
  /// In en, this message translates to:
  /// **'Icon name'**
  String get adminFieldIcon;

  /// No description provided for @adminFieldSort.
  ///
  /// In en, this message translates to:
  /// **'Display order'**
  String get adminFieldSort;

  /// No description provided for @adminFieldActive.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get adminFieldActive;

  /// No description provided for @adminInactive.
  ///
  /// In en, this message translates to:
  /// **'Inactive'**
  String get adminInactive;

  /// No description provided for @adminFieldPassword.
  ///
  /// In en, this message translates to:
  /// **'Password (optional)'**
  String get adminFieldPassword;

  /// No description provided for @adminFieldParent.
  ///
  /// In en, this message translates to:
  /// **'Parent category'**
  String get adminFieldParent;

  /// No description provided for @adminFieldCategory.
  ///
  /// In en, this message translates to:
  /// **'Category'**
  String get adminFieldCategory;

  /// No description provided for @adminFieldRole.
  ///
  /// In en, this message translates to:
  /// **'Role'**
  String get adminFieldRole;

  /// No description provided for @adminFieldStatus.
  ///
  /// In en, this message translates to:
  /// **'Product status'**
  String get adminFieldStatus;

  /// No description provided for @adminStatusActive.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get adminStatusActive;

  /// No description provided for @adminStatusHidden.
  ///
  /// In en, this message translates to:
  /// **'Hidden'**
  String get adminStatusHidden;

  /// No description provided for @adminStatusArchived.
  ///
  /// In en, this message translates to:
  /// **'Archived'**
  String get adminStatusArchived;

  /// No description provided for @adminFieldExpiry.
  ///
  /// In en, this message translates to:
  /// **'Track expiry'**
  String get adminFieldExpiry;

  /// No description provided for @adminFieldNegotiable.
  ///
  /// In en, this message translates to:
  /// **'Negotiable'**
  String get adminFieldNegotiable;

  /// No description provided for @adminImages.
  ///
  /// In en, this message translates to:
  /// **'Image URLs — one per line'**
  String get adminImages;

  /// No description provided for @adminVariants.
  ///
  /// In en, this message translates to:
  /// **'Product variants'**
  String get adminVariants;

  /// No description provided for @adminAddVariant.
  ///
  /// In en, this message translates to:
  /// **'Add variant'**
  String get adminAddVariant;

  /// No description provided for @adminSku.
  ///
  /// In en, this message translates to:
  /// **'SKU'**
  String get adminSku;

  /// No description provided for @adminPriceDelta.
  ///
  /// In en, this message translates to:
  /// **'Price difference'**
  String get adminPriceDelta;

  /// No description provided for @adminAttributes.
  ///
  /// In en, this message translates to:
  /// **'Attributes'**
  String get adminAttributes;

  /// No description provided for @adminAttributeName.
  ///
  /// In en, this message translates to:
  /// **'Attribute'**
  String get adminAttributeName;

  /// No description provided for @adminAttributeValue.
  ///
  /// In en, this message translates to:
  /// **'Value'**
  String get adminAttributeValue;

  /// No description provided for @adminAddAttribute.
  ///
  /// In en, this message translates to:
  /// **'Add attribute'**
  String get adminAddAttribute;

  /// No description provided for @adminPermissions.
  ///
  /// In en, this message translates to:
  /// **'Permissions'**
  String get adminPermissions;

  /// No description provided for @adminRequired.
  ///
  /// In en, this message translates to:
  /// **'This field is required'**
  String get adminRequired;

  /// No description provided for @adminInvalidNumber.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid number'**
  String get adminInvalidNumber;

  /// No description provided for @adminInvalidEmail.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid email'**
  String get adminInvalidEmail;

  /// No description provided for @adminInvalidUrl.
  ///
  /// In en, this message translates to:
  /// **'Enter image URLs starting with https or http'**
  String get adminInvalidUrl;

  /// No description provided for @adminAllRoles.
  ///
  /// In en, this message translates to:
  /// **'All roles'**
  String get adminAllRoles;

  /// No description provided for @adminNoParent.
  ///
  /// In en, this message translates to:
  /// **'No parent category'**
  String get adminNoParent;

  /// No description provided for @adminSelect.
  ///
  /// In en, this message translates to:
  /// **'Select'**
  String get adminSelect;

  /// No description provided for @adminSelected.
  ///
  /// In en, this message translates to:
  /// **'Selected'**
  String get adminSelected;

  /// No description provided for @adminSelectedWarehouse.
  ///
  /// In en, this message translates to:
  /// **'Selected warehouse'**
  String get adminSelectedWarehouse;

  /// No description provided for @adminSelectedLocation.
  ///
  /// In en, this message translates to:
  /// **'Selected location'**
  String get adminSelectedLocation;

  /// No description provided for @adminZone.
  ///
  /// In en, this message translates to:
  /// **'Zone'**
  String get adminZone;

  /// No description provided for @adminAisle.
  ///
  /// In en, this message translates to:
  /// **'Aisle'**
  String get adminAisle;

  /// No description provided for @adminShelf.
  ///
  /// In en, this message translates to:
  /// **'Shelf'**
  String get adminShelf;

  /// No description provided for @adminBin.
  ///
  /// In en, this message translates to:
  /// **'Bin'**
  String get adminBin;

  /// No description provided for @adminNoLocation.
  ///
  /// In en, this message translates to:
  /// **'No location selected'**
  String get adminNoLocation;

  /// No description provided for @adminCatalogHub.
  ///
  /// In en, this message translates to:
  /// **'Manage products and categories'**
  String get adminCatalogHub;

  /// No description provided for @adminUsersHub.
  ///
  /// In en, this message translates to:
  /// **'Manage users and roles'**
  String get adminUsersHub;

  /// No description provided for @adminPermissionHint.
  ///
  /// In en, this message translates to:
  /// **'Choose the operations this role may use'**
  String get adminPermissionHint;

  /// No description provided for @adminPermissionCatalogView.
  ///
  /// In en, this message translates to:
  /// **'View catalog'**
  String get adminPermissionCatalogView;

  /// No description provided for @adminPermissionCatalogManage.
  ///
  /// In en, this message translates to:
  /// **'Manage catalog'**
  String get adminPermissionCatalogManage;

  /// No description provided for @adminPermissionOrdersView.
  ///
  /// In en, this message translates to:
  /// **'View orders'**
  String get adminPermissionOrdersView;

  /// No description provided for @adminPermissionOrdersConfirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm orders'**
  String get adminPermissionOrdersConfirm;

  /// No description provided for @adminPermissionOrdersUpdate.
  ///
  /// In en, this message translates to:
  /// **'Update orders'**
  String get adminPermissionOrdersUpdate;

  /// No description provided for @adminPermissionInventoryView.
  ///
  /// In en, this message translates to:
  /// **'View inventory'**
  String get adminPermissionInventoryView;

  /// No description provided for @adminPermissionInventoryPick.
  ///
  /// In en, this message translates to:
  /// **'Pick orders'**
  String get adminPermissionInventoryPick;

  /// No description provided for @adminPermissionInventoryAdjust.
  ///
  /// In en, this message translates to:
  /// **'Adjust inventory'**
  String get adminPermissionInventoryAdjust;

  /// No description provided for @adminPermissionInventoryTransfer.
  ///
  /// In en, this message translates to:
  /// **'Transfer inventory'**
  String get adminPermissionInventoryTransfer;

  /// No description provided for @adminPermissionPurchasingView.
  ///
  /// In en, this message translates to:
  /// **'View purchases and suppliers'**
  String get adminPermissionPurchasingView;

  /// No description provided for @adminPermissionPurchasingManage.
  ///
  /// In en, this message translates to:
  /// **'Manage purchases and suppliers'**
  String get adminPermissionPurchasingManage;

  /// No description provided for @adminPermissionReturnsView.
  ///
  /// In en, this message translates to:
  /// **'View returns'**
  String get adminPermissionReturnsView;

  /// No description provided for @adminPermissionReturnsProcess.
  ///
  /// In en, this message translates to:
  /// **'Process returns'**
  String get adminPermissionReturnsProcess;

  /// No description provided for @adminPermissionDeliveryAssigned.
  ///
  /// In en, this message translates to:
  /// **'View and update assigned deliveries'**
  String get adminPermissionDeliveryAssigned;

  /// No description provided for @adminPermissionLoyaltyManage.
  ///
  /// In en, this message translates to:
  /// **'Manage loyalty points'**
  String get adminPermissionLoyaltyManage;

  /// No description provided for @adminPermissionUsersManage.
  ///
  /// In en, this message translates to:
  /// **'Manage users and roles'**
  String get adminPermissionUsersManage;

  /// No description provided for @adminPermissionReportsView.
  ///
  /// In en, this message translates to:
  /// **'View reports'**
  String get adminPermissionReportsView;

  /// No description provided for @adminPermissionSettingsManage.
  ///
  /// In en, this message translates to:
  /// **'Manage store settings'**
  String get adminPermissionSettingsManage;

  /// No description provided for @adminOrderConfirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm order'**
  String get adminOrderConfirm;

  /// No description provided for @adminOrderUpdate.
  ///
  /// In en, this message translates to:
  /// **'Update status'**
  String get adminOrderUpdate;

  /// No description provided for @adminOrderCurrentStatus.
  ///
  /// In en, this message translates to:
  /// **'Current status'**
  String get adminOrderCurrentStatus;

  /// No description provided for @adminOrderNewStatus.
  ///
  /// In en, this message translates to:
  /// **'New status'**
  String get adminOrderNewStatus;

  /// No description provided for @adminOrderConfirmMessage.
  ///
  /// In en, this message translates to:
  /// **'Confirm acceptance of this order?'**
  String get adminOrderConfirmMessage;

  /// No description provided for @adminOrderUpdated.
  ///
  /// In en, this message translates to:
  /// **'Order status updated'**
  String get adminOrderUpdated;

  /// No description provided for @adminOrderSearch.
  ///
  /// In en, this message translates to:
  /// **'Search by order number or customer'**
  String get adminOrderSearch;

  /// No description provided for @adminOrderClearSearch.
  ///
  /// In en, this message translates to:
  /// **'Clear search'**
  String get adminOrderClearSearch;

  /// No description provided for @adminOrderDateRange.
  ///
  /// In en, this message translates to:
  /// **'Date range'**
  String get adminOrderDateRange;

  /// No description provided for @adminOrderClearDates.
  ///
  /// In en, this message translates to:
  /// **'Clear date filter'**
  String get adminOrderClearDates;

  /// No description provided for @adminOrderEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'Try another status, search or date range.'**
  String get adminOrderEmptyHint;

  /// No description provided for @filterOnSale.
  ///
  /// In en, this message translates to:
  /// **'Offers'**
  String get filterOnSale;

  /// No description provided for @promotionDiscount.
  ///
  /// In en, this message translates to:
  /// **'{percent}% off'**
  String promotionDiscount(String percent);

  /// No description provided for @promotionOriginalPrice.
  ///
  /// In en, this message translates to:
  /// **'Original price: {price}'**
  String promotionOriginalPrice(String price);

  /// No description provided for @promotionBasePrice.
  ///
  /// In en, this message translates to:
  /// **'Base product offer'**
  String get promotionBasePrice;

  /// No description provided for @adminOriginalPrice.
  ///
  /// In en, this message translates to:
  /// **'Original price (optional)'**
  String get adminOriginalPrice;

  /// No description provided for @adminOriginalPriceHint.
  ///
  /// In en, this message translates to:
  /// **'Leave empty or set no higher than the sale price to remove the offer.'**
  String get adminOriginalPriceHint;

  /// No description provided for @bannerPosition.
  ///
  /// In en, this message translates to:
  /// **'{current} of {total}'**
  String bannerPosition(String current, String total);

  /// No description provided for @bannerOpenFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not open this link. Please try again.'**
  String get bannerOpenFailed;

  /// No description provided for @startupTagline.
  ///
  /// In en, this message translates to:
  /// **'Everything you need, all in one place'**
  String get startupTagline;

  /// No description provided for @startupLoading.
  ///
  /// In en, this message translates to:
  /// **'Getting the app ready'**
  String get startupLoading;

  /// No description provided for @adminUserSearch.
  ///
  /// In en, this message translates to:
  /// **'Search for a user'**
  String get adminUserSearch;

  /// No description provided for @accountEditProfile.
  ///
  /// In en, this message translates to:
  /// **'Edit profile'**
  String get accountEditProfile;

  /// No description provided for @accountNoName.
  ///
  /// In en, this message translates to:
  /// **'No name added'**
  String get accountNoName;

  /// No description provided for @accountNoEmail.
  ///
  /// In en, this message translates to:
  /// **'No email added'**
  String get accountNoEmail;

  /// No description provided for @accountNoPhone.
  ///
  /// In en, this message translates to:
  /// **'Phone number unavailable'**
  String get accountNoPhone;

  /// No description provided for @profilePhone.
  ///
  /// In en, this message translates to:
  /// **'Phone number'**
  String get profilePhone;

  /// No description provided for @profileChangePhone.
  ///
  /// In en, this message translates to:
  /// **'Change'**
  String get profileChangePhone;

  /// No description provided for @profilePhoneChangeUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Phone changes are not available yet. The new number will need OTP verification.'**
  String get profilePhoneChangeUnavailable;

  /// No description provided for @addressContactPhone.
  ///
  /// In en, this message translates to:
  /// **'Contact phone'**
  String get addressContactPhone;

  /// No description provided for @addressUsePrimaryPhone.
  ///
  /// In en, this message translates to:
  /// **'Use my primary number'**
  String get addressUsePrimaryPhone;

  /// No description provided for @addressUseOtherPhone.
  ///
  /// In en, this message translates to:
  /// **'Use another number'**
  String get addressUseOtherPhone;

  /// No description provided for @addressOtherPhone.
  ///
  /// In en, this message translates to:
  /// **'Other phone number'**
  String get addressOtherPhone;

  /// No description provided for @addressPrimaryPhoneBadge.
  ///
  /// In en, this message translates to:
  /// **'Primary'**
  String get addressPrimaryPhoneBadge;

  /// No description provided for @addressContactUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Contact phone unavailable'**
  String get addressContactUnavailable;

  /// No description provided for @addressContactBackendPending.
  ///
  /// In en, this message translates to:
  /// **'Saving a contact phone is not available in the service yet.'**
  String get addressContactBackendPending;

  /// No description provided for @accountSignOutConfirm.
  ///
  /// In en, this message translates to:
  /// **'Do you want to sign out?'**
  String get accountSignOutConfirm;

  /// No description provided for @accountDeleteAcknowledgement.
  ///
  /// In en, this message translates to:
  /// **'I confirm that I want to delete my account'**
  String get accountDeleteAcknowledgement;

  /// No description provided for @mainCategoriesTitle.
  ///
  /// In en, this message translates to:
  /// **'Main Categories'**
  String get mainCategoriesTitle;

  /// No description provided for @categoryGroupElectronics.
  ///
  /// In en, this message translates to:
  /// **'Electronics'**
  String get categoryGroupElectronics;

  /// No description provided for @categoryIconElectronicsDevices.
  ///
  /// In en, this message translates to:
  /// **'Devices'**
  String get categoryIconElectronicsDevices;

  /// No description provided for @categoryIconElectronicsCable.
  ///
  /// In en, this message translates to:
  /// **'Cables'**
  String get categoryIconElectronicsCable;

  /// No description provided for @categoryIconElectronicsRouter.
  ///
  /// In en, this message translates to:
  /// **'Routers'**
  String get categoryIconElectronicsRouter;

  /// No description provided for @categoryIconElectronicsTv.
  ///
  /// In en, this message translates to:
  /// **'Televisions'**
  String get categoryIconElectronicsTv;

  /// No description provided for @categoryIconElectronicsPower.
  ///
  /// In en, this message translates to:
  /// **'Electrical supplies'**
  String get categoryIconElectronicsPower;

  /// No description provided for @categoryIconElectronicsBattery.
  ///
  /// In en, this message translates to:
  /// **'Batteries'**
  String get categoryIconElectronicsBattery;

  /// No description provided for @categoryGroupPhones.
  ///
  /// In en, this message translates to:
  /// **'Phones'**
  String get categoryGroupPhones;

  /// No description provided for @categoryIconMobilePhone.
  ///
  /// In en, this message translates to:
  /// **'Phones'**
  String get categoryIconMobilePhone;

  /// No description provided for @categoryIconMobileTablet.
  ///
  /// In en, this message translates to:
  /// **'Tablets'**
  String get categoryIconMobileTablet;

  /// No description provided for @categoryIconMobileCharging.
  ///
  /// In en, this message translates to:
  /// **'Chargers'**
  String get categoryIconMobileCharging;

  /// No description provided for @categoryIconMobileWatch.
  ///
  /// In en, this message translates to:
  /// **'Smart watches'**
  String get categoryIconMobileWatch;

  /// No description provided for @categoryGroupComputers.
  ///
  /// In en, this message translates to:
  /// **'Computers'**
  String get categoryGroupComputers;

  /// No description provided for @categoryIconComputerLaptop.
  ///
  /// In en, this message translates to:
  /// **'Laptops'**
  String get categoryIconComputerLaptop;

  /// No description provided for @categoryIconComputerDesktop.
  ///
  /// In en, this message translates to:
  /// **'Desktop computers'**
  String get categoryIconComputerDesktop;

  /// No description provided for @categoryIconComputerKeyboard.
  ///
  /// In en, this message translates to:
  /// **'Keyboards'**
  String get categoryIconComputerKeyboard;

  /// No description provided for @categoryIconComputerMouse.
  ///
  /// In en, this message translates to:
  /// **'Mice'**
  String get categoryIconComputerMouse;

  /// No description provided for @categoryIconComputerPrinter.
  ///
  /// In en, this message translates to:
  /// **'Printers'**
  String get categoryIconComputerPrinter;

  /// No description provided for @categoryIconComputerStorage.
  ///
  /// In en, this message translates to:
  /// **'Storage'**
  String get categoryIconComputerStorage;

  /// No description provided for @categoryGroupAudio.
  ///
  /// In en, this message translates to:
  /// **'Audio'**
  String get categoryGroupAudio;

  /// No description provided for @categoryIconAudioHeadphones.
  ///
  /// In en, this message translates to:
  /// **'Headphones'**
  String get categoryIconAudioHeadphones;

  /// No description provided for @categoryIconAudioEarbuds.
  ///
  /// In en, this message translates to:
  /// **'Earbuds'**
  String get categoryIconAudioEarbuds;

  /// No description provided for @categoryIconAudioSpeaker.
  ///
  /// In en, this message translates to:
  /// **'Speakers'**
  String get categoryIconAudioSpeaker;

  /// No description provided for @categoryIconAudioMic.
  ///
  /// In en, this message translates to:
  /// **'Microphones'**
  String get categoryIconAudioMic;

  /// No description provided for @categoryIconAudioRadio.
  ///
  /// In en, this message translates to:
  /// **'Radios'**
  String get categoryIconAudioRadio;

  /// No description provided for @categoryGroupCameras.
  ///
  /// In en, this message translates to:
  /// **'Cameras'**
  String get categoryGroupCameras;

  /// No description provided for @categoryIconCameraPhoto.
  ///
  /// In en, this message translates to:
  /// **'Cameras'**
  String get categoryIconCameraPhoto;

  /// No description provided for @categoryIconCameraVideo.
  ///
  /// In en, this message translates to:
  /// **'Video cameras'**
  String get categoryIconCameraVideo;

  /// No description provided for @categoryIconCameraLens.
  ///
  /// In en, this message translates to:
  /// **'Lenses'**
  String get categoryIconCameraLens;

  /// No description provided for @categoryIconCameraSecurity.
  ///
  /// In en, this message translates to:
  /// **'Security cameras'**
  String get categoryIconCameraSecurity;

  /// No description provided for @categoryGroupGaming.
  ///
  /// In en, this message translates to:
  /// **'Gaming'**
  String get categoryGroupGaming;

  /// No description provided for @categoryIconGamingConsole.
  ///
  /// In en, this message translates to:
  /// **'Game consoles'**
  String get categoryIconGamingConsole;

  /// No description provided for @categoryIconGamingController.
  ///
  /// In en, this message translates to:
  /// **'Controllers'**
  String get categoryIconGamingController;

  /// No description provided for @categoryGroupFashion.
  ///
  /// In en, this message translates to:
  /// **'Fashion'**
  String get categoryGroupFashion;

  /// No description provided for @categoryIconFashionClothing.
  ///
  /// In en, this message translates to:
  /// **'Clothing'**
  String get categoryIconFashionClothing;

  /// No description provided for @categoryIconFashionMen.
  ///
  /// In en, this message translates to:
  /// **'Menswear'**
  String get categoryIconFashionMen;

  /// No description provided for @categoryIconFashionWomen.
  ///
  /// In en, this message translates to:
  /// **'Womenswear'**
  String get categoryIconFashionWomen;

  /// No description provided for @categoryIconFashionShoes.
  ///
  /// In en, this message translates to:
  /// **'Footwear'**
  String get categoryIconFashionShoes;

  /// No description provided for @categoryIconFashionUniform.
  ///
  /// In en, this message translates to:
  /// **'Workwear'**
  String get categoryIconFashionUniform;

  /// No description provided for @categoryIconFashionLaundry.
  ///
  /// In en, this message translates to:
  /// **'Clothing care'**
  String get categoryIconFashionLaundry;

  /// No description provided for @categoryGroupAccessories.
  ///
  /// In en, this message translates to:
  /// **'Bags & accessories'**
  String get categoryGroupAccessories;

  /// No description provided for @categoryIconAccessoriesWatch.
  ///
  /// In en, this message translates to:
  /// **'Watches'**
  String get categoryIconAccessoriesWatch;

  /// No description provided for @categoryIconAccessoriesBag.
  ///
  /// In en, this message translates to:
  /// **'Bags'**
  String get categoryIconAccessoriesBag;

  /// No description provided for @categoryIconAccessoriesBackpack.
  ///
  /// In en, this message translates to:
  /// **'Backpacks'**
  String get categoryIconAccessoriesBackpack;

  /// No description provided for @categoryIconAccessoriesLuggage.
  ///
  /// In en, this message translates to:
  /// **'Luggage'**
  String get categoryIconAccessoriesLuggage;

  /// No description provided for @categoryIconAccessoriesJewelry.
  ///
  /// In en, this message translates to:
  /// **'Jewelry'**
  String get categoryIconAccessoriesJewelry;

  /// No description provided for @categoryIconAccessoriesUmbrella.
  ///
  /// In en, this message translates to:
  /// **'Umbrellas'**
  String get categoryIconAccessoriesUmbrella;

  /// No description provided for @categoryGroupHome.
  ///
  /// In en, this message translates to:
  /// **'Home & furniture'**
  String get categoryGroupHome;

  /// No description provided for @categoryIconHomeFurniture.
  ///
  /// In en, this message translates to:
  /// **'Furniture'**
  String get categoryIconHomeFurniture;

  /// No description provided for @categoryIconHomeChair.
  ///
  /// In en, this message translates to:
  /// **'Chairs'**
  String get categoryIconHomeChair;

  /// No description provided for @categoryIconHomeBed.
  ///
  /// In en, this message translates to:
  /// **'Beds'**
  String get categoryIconHomeBed;

  /// No description provided for @categoryIconHomeTable.
  ///
  /// In en, this message translates to:
  /// **'Tables'**
  String get categoryIconHomeTable;

  /// No description provided for @categoryIconHomeLighting.
  ///
  /// In en, this message translates to:
  /// **'Lighting'**
  String get categoryIconHomeLighting;

  /// No description provided for @categoryIconHomeBath.
  ///
  /// In en, this message translates to:
  /// **'Bathroom'**
  String get categoryIconHomeBath;

  /// No description provided for @categoryIconHomeCurtains.
  ///
  /// In en, this message translates to:
  /// **'Curtains'**
  String get categoryIconHomeCurtains;

  /// No description provided for @categoryIconHomeBedding.
  ///
  /// In en, this message translates to:
  /// **'Bedding'**
  String get categoryIconHomeBedding;

  /// No description provided for @categoryGroupKitchen.
  ///
  /// In en, this message translates to:
  /// **'Kitchen'**
  String get categoryGroupKitchen;

  /// No description provided for @categoryIconKitchenAppliances.
  ///
  /// In en, this message translates to:
  /// **'Appliances'**
  String get categoryIconKitchenAppliances;

  /// No description provided for @categoryIconKitchenCooking.
  ///
  /// In en, this message translates to:
  /// **'Cookware'**
  String get categoryIconKitchenCooking;

  /// No description provided for @categoryIconKitchenTableware.
  ///
  /// In en, this message translates to:
  /// **'Tableware'**
  String get categoryIconKitchenTableware;

  /// No description provided for @categoryIconKitchenBlender.
  ///
  /// In en, this message translates to:
  /// **'Blenders'**
  String get categoryIconKitchenBlender;

  /// No description provided for @categoryIconKitchenMicrowave.
  ///
  /// In en, this message translates to:
  /// **'Microwaves'**
  String get categoryIconKitchenMicrowave;

  /// No description provided for @categoryIconKitchenKettle.
  ///
  /// In en, this message translates to:
  /// **'Coffee makers'**
  String get categoryIconKitchenKettle;

  /// No description provided for @categoryGroupCleaning.
  ///
  /// In en, this message translates to:
  /// **'Cleaning'**
  String get categoryGroupCleaning;

  /// No description provided for @categoryIconCleaningSupplies.
  ///
  /// In en, this message translates to:
  /// **'Cleaning supplies'**
  String get categoryIconCleaningSupplies;

  /// No description provided for @categoryIconCleaningSoap.
  ///
  /// In en, this message translates to:
  /// **'Soap'**
  String get categoryIconCleaningSoap;

  /// No description provided for @categoryIconCleaningBins.
  ///
  /// In en, this message translates to:
  /// **'Waste bins'**
  String get categoryIconCleaningBins;

  /// No description provided for @categoryIconCleaningWater.
  ///
  /// In en, this message translates to:
  /// **'Water care'**
  String get categoryIconCleaningWater;

  /// No description provided for @categoryGroupFood.
  ///
  /// In en, this message translates to:
  /// **'Grocery & food'**
  String get categoryGroupFood;

  /// No description provided for @categoryIconGroceryFood.
  ///
  /// In en, this message translates to:
  /// **'Groceries'**
  String get categoryIconGroceryFood;

  /// No description provided for @categoryIconFoodRice.
  ///
  /// In en, this message translates to:
  /// **'Rice & grains'**
  String get categoryIconFoodRice;

  /// No description provided for @categoryIconFoodBakery.
  ///
  /// In en, this message translates to:
  /// **'Bakery'**
  String get categoryIconFoodBakery;

  /// No description provided for @categoryIconFoodFruit.
  ///
  /// In en, this message translates to:
  /// **'Fruit'**
  String get categoryIconFoodFruit;

  /// No description provided for @categoryIconFoodVegetables.
  ///
  /// In en, this message translates to:
  /// **'Vegetables'**
  String get categoryIconFoodVegetables;

  /// No description provided for @categoryIconFoodMeat.
  ///
  /// In en, this message translates to:
  /// **'Meat'**
  String get categoryIconFoodMeat;

  /// No description provided for @categoryIconFoodSeafood.
  ///
  /// In en, this message translates to:
  /// **'Seafood'**
  String get categoryIconFoodSeafood;

  /// No description provided for @categoryIconFoodPizza.
  ///
  /// In en, this message translates to:
  /// **'Pizza'**
  String get categoryIconFoodPizza;

  /// No description provided for @categoryIconFoodIcecream.
  ///
  /// In en, this message translates to:
  /// **'Ice cream'**
  String get categoryIconFoodIcecream;

  /// No description provided for @categoryIconFoodCake.
  ///
  /// In en, this message translates to:
  /// **'Cakes'**
  String get categoryIconFoodCake;

  /// No description provided for @categoryIconFoodEggs.
  ///
  /// In en, this message translates to:
  /// **'Eggs'**
  String get categoryIconFoodEggs;

  /// No description provided for @categoryIconFoodSnacks.
  ///
  /// In en, this message translates to:
  /// **'Snacks'**
  String get categoryIconFoodSnacks;

  /// No description provided for @categoryGroupDrinks.
  ///
  /// In en, this message translates to:
  /// **'Drinks'**
  String get categoryGroupDrinks;

  /// No description provided for @categoryIconDrinksCoffee.
  ///
  /// In en, this message translates to:
  /// **'Coffee'**
  String get categoryIconDrinksCoffee;

  /// No description provided for @categoryIconDrinksTea.
  ///
  /// In en, this message translates to:
  /// **'Tea'**
  String get categoryIconDrinksTea;

  /// No description provided for @categoryIconDrinksJuice.
  ///
  /// In en, this message translates to:
  /// **'Juices'**
  String get categoryIconDrinksJuice;

  /// No description provided for @categoryIconDrinksWater.
  ///
  /// In en, this message translates to:
  /// **'Water'**
  String get categoryIconDrinksWater;

  /// No description provided for @categoryGroupBeauty.
  ///
  /// In en, this message translates to:
  /// **'Health & beauty'**
  String get categoryGroupBeauty;

  /// No description provided for @categoryIconBeautySpa.
  ///
  /// In en, this message translates to:
  /// **'Beauty care'**
  String get categoryIconBeautySpa;

  /// No description provided for @categoryIconBeautySkin.
  ///
  /// In en, this message translates to:
  /// **'Skin care'**
  String get categoryIconBeautySkin;

  /// No description provided for @categoryIconBeautyHair.
  ///
  /// In en, this message translates to:
  /// **'Hair care'**
  String get categoryIconBeautyHair;

  /// No description provided for @categoryIconBeautyCosmetics.
  ///
  /// In en, this message translates to:
  /// **'Cosmetics'**
  String get categoryIconBeautyCosmetics;

  /// No description provided for @categoryIconBeautyHealth.
  ///
  /// In en, this message translates to:
  /// **'Health supplies'**
  String get categoryIconBeautyHealth;

  /// No description provided for @categoryIconBeautyHygiene.
  ///
  /// In en, this message translates to:
  /// **'Personal hygiene'**
  String get categoryIconBeautyHygiene;

  /// No description provided for @categoryIconBeautyMedical.
  ///
  /// In en, this message translates to:
  /// **'First aid'**
  String get categoryIconBeautyMedical;

  /// No description provided for @categoryGroupSport.
  ///
  /// In en, this message translates to:
  /// **'Sports & fitness'**
  String get categoryGroupSport;

  /// No description provided for @categoryIconSportFitness.
  ///
  /// In en, this message translates to:
  /// **'Fitness'**
  String get categoryIconSportFitness;

  /// No description provided for @categoryIconSportCycling.
  ///
  /// In en, this message translates to:
  /// **'Cycling'**
  String get categoryIconSportCycling;

  /// No description provided for @categoryIconSportFootball.
  ///
  /// In en, this message translates to:
  /// **'Football'**
  String get categoryIconSportFootball;

  /// No description provided for @categoryIconSportBasketball.
  ///
  /// In en, this message translates to:
  /// **'Basketball'**
  String get categoryIconSportBasketball;

  /// No description provided for @categoryIconSportTennis.
  ///
  /// In en, this message translates to:
  /// **'Tennis'**
  String get categoryIconSportTennis;

  /// No description provided for @categoryIconSportSwimming.
  ///
  /// In en, this message translates to:
  /// **'Swimming'**
  String get categoryIconSportSwimming;

  /// No description provided for @categoryIconSportCamping.
  ///
  /// In en, this message translates to:
  /// **'Camping'**
  String get categoryIconSportCamping;

  /// No description provided for @categoryIconSportFishing.
  ///
  /// In en, this message translates to:
  /// **'Fishing'**
  String get categoryIconSportFishing;

  /// No description provided for @categoryGroupKids.
  ///
  /// In en, this message translates to:
  /// **'Babies & toys'**
  String get categoryGroupKids;

  /// No description provided for @categoryIconKidsBaby.
  ///
  /// In en, this message translates to:
  /// **'Baby care'**
  String get categoryIconKidsBaby;

  /// No description provided for @categoryIconKidsStroller.
  ///
  /// In en, this message translates to:
  /// **'Strollers'**
  String get categoryIconKidsStroller;

  /// No description provided for @categoryIconKidsToys.
  ///
  /// In en, this message translates to:
  /// **'Toys'**
  String get categoryIconKidsToys;

  /// No description provided for @categoryIconKidsPuzzle.
  ///
  /// In en, this message translates to:
  /// **'Puzzles'**
  String get categoryIconKidsPuzzle;

  /// No description provided for @categoryIconKidsScooter.
  ///
  /// In en, this message translates to:
  /// **'Skates & scooters'**
  String get categoryIconKidsScooter;

  /// No description provided for @categoryGroupAuto.
  ///
  /// In en, this message translates to:
  /// **'Auto supplies'**
  String get categoryGroupAuto;

  /// No description provided for @categoryIconAutoCar.
  ///
  /// In en, this message translates to:
  /// **'Car supplies'**
  String get categoryIconAutoCar;

  /// No description provided for @categoryIconAutoMotorcycle.
  ///
  /// In en, this message translates to:
  /// **'Motorcycles'**
  String get categoryIconAutoMotorcycle;

  /// No description provided for @categoryIconAutoTires.
  ///
  /// In en, this message translates to:
  /// **'Tires'**
  String get categoryIconAutoTires;

  /// No description provided for @categoryIconAutoFuel.
  ///
  /// In en, this message translates to:
  /// **'Fuel & oils'**
  String get categoryIconAutoFuel;

  /// No description provided for @categoryIconAutoTools.
  ///
  /// In en, this message translates to:
  /// **'Car tools'**
  String get categoryIconAutoTools;

  /// No description provided for @categoryGroupBooks.
  ///
  /// In en, this message translates to:
  /// **'Books & stationery'**
  String get categoryGroupBooks;

  /// No description provided for @categoryIconBooksReading.
  ///
  /// In en, this message translates to:
  /// **'Books'**
  String get categoryIconBooksReading;

  /// No description provided for @categoryIconBooksNotebooks.
  ///
  /// In en, this message translates to:
  /// **'Notebooks'**
  String get categoryIconBooksNotebooks;

  /// No description provided for @categoryIconBooksPens.
  ///
  /// In en, this message translates to:
  /// **'Pens'**
  String get categoryIconBooksPens;

  /// No description provided for @categoryIconBooksArt.
  ///
  /// In en, this message translates to:
  /// **'Art supplies'**
  String get categoryIconBooksArt;

  /// No description provided for @categoryIconBooksSchool.
  ///
  /// In en, this message translates to:
  /// **'School supplies'**
  String get categoryIconBooksSchool;

  /// No description provided for @categoryGroupGarden.
  ///
  /// In en, this message translates to:
  /// **'Pets, garden & tools'**
  String get categoryGroupGarden;

  /// No description provided for @categoryIconPetsSupplies.
  ///
  /// In en, this message translates to:
  /// **'Pet supplies'**
  String get categoryIconPetsSupplies;

  /// No description provided for @categoryIconGardenTrees.
  ///
  /// In en, this message translates to:
  /// **'Garden plants'**
  String get categoryIconGardenTrees;

  /// No description provided for @categoryIconGardenFlowers.
  ///
  /// In en, this message translates to:
  /// **'Flowers'**
  String get categoryIconGardenFlowers;

  /// No description provided for @categoryIconGardenTools.
  ///
  /// In en, this message translates to:
  /// **'Hand tools'**
  String get categoryIconGardenTools;

  /// No description provided for @categoryIconGardenBuilding.
  ///
  /// In en, this message translates to:
  /// **'Building supplies'**
  String get categoryIconGardenBuilding;

  /// No description provided for @categoryIconGardenSolar.
  ///
  /// In en, this message translates to:
  /// **'Solar supplies'**
  String get categoryIconGardenSolar;

  /// No description provided for @categoryIconGardenWatering.
  ///
  /// In en, this message translates to:
  /// **'Garden care'**
  String get categoryIconGardenWatering;

  /// No description provided for @categoryGroupGifts.
  ///
  /// In en, this message translates to:
  /// **'Gifts & general'**
  String get categoryGroupGifts;

  /// No description provided for @categoryIconGiftsPresent.
  ///
  /// In en, this message translates to:
  /// **'Gifts'**
  String get categoryIconGiftsPresent;

  /// No description provided for @categoryIconBeautyFragrance.
  ///
  /// In en, this message translates to:
  /// **'Fragrances'**
  String get categoryIconBeautyFragrance;

  /// No description provided for @categoryIconGiftsParty.
  ///
  /// In en, this message translates to:
  /// **'Party supplies'**
  String get categoryIconGiftsParty;

  /// No description provided for @categoryIconGeneralCrafts.
  ///
  /// In en, this message translates to:
  /// **'Craft supplies'**
  String get categoryIconGeneralCrafts;

  /// No description provided for @categoryIconGeneralMusic.
  ///
  /// In en, this message translates to:
  /// **'Musical instruments'**
  String get categoryIconGeneralMusic;

  /// No description provided for @categoryIconGeneralCategory.
  ///
  /// In en, this message translates to:
  /// **'General products'**
  String get categoryIconGeneralCategory;

  /// No description provided for @categoryChooseIcon.
  ///
  /// In en, this message translates to:
  /// **'Choose icon'**
  String get categoryChooseIcon;

  /// No description provided for @categorySearchIcons.
  ///
  /// In en, this message translates to:
  /// **'Search icons'**
  String get categorySearchIcons;

  /// No description provided for @categoryAllGroups.
  ///
  /// In en, this message translates to:
  /// **'All groups'**
  String get categoryAllGroups;

  /// No description provided for @categoryNoIcons.
  ///
  /// In en, this message translates to:
  /// **'No matching icons'**
  String get categoryNoIcons;

  /// No description provided for @categoryDescriptionEn.
  ///
  /// In en, this message translates to:
  /// **'Short description (English)'**
  String get categoryDescriptionEn;

  /// No description provided for @categoryDescriptionAr.
  ///
  /// In en, this message translates to:
  /// **'Short description (Arabic)'**
  String get categoryDescriptionAr;

  /// No description provided for @categoryDescriptionLimit.
  ///
  /// In en, this message translates to:
  /// **'Required · up to {words} words and {characters} characters'**
  String categoryDescriptionLimit(String words, String characters);

  /// No description provided for @categoryDescriptionInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a short description within both limits'**
  String get categoryDescriptionInvalid;

  /// No description provided for @categoryImage.
  ///
  /// In en, this message translates to:
  /// **'Category image'**
  String get categoryImage;

  /// No description provided for @mediaImages.
  ///
  /// In en, this message translates to:
  /// **'Product images'**
  String get mediaImages;

  /// No description provided for @mediaAdd.
  ///
  /// In en, this message translates to:
  /// **'Add images'**
  String get mediaAdd;

  /// No description provided for @mediaChoose.
  ///
  /// In en, this message translates to:
  /// **'Choose image'**
  String get mediaChoose;

  /// No description provided for @mediaReplace.
  ///
  /// In en, this message translates to:
  /// **'Replace'**
  String get mediaReplace;

  /// No description provided for @mediaRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get mediaRemove;

  /// No description provided for @mediaEarlier.
  ///
  /// In en, this message translates to:
  /// **'Move earlier'**
  String get mediaEarlier;

  /// No description provided for @mediaLater.
  ///
  /// In en, this message translates to:
  /// **'Move later'**
  String get mediaLater;

  /// No description provided for @mediaEmpty.
  ///
  /// In en, this message translates to:
  /// **'No image selected'**
  String get mediaEmpty;

  /// No description provided for @mediaSessionHint.
  ///
  /// In en, this message translates to:
  /// **'Selected photos last only for this mock session.'**
  String get mediaSessionHint;

  /// No description provided for @mediaRemoteHint.
  ///
  /// In en, this message translates to:
  /// **'Photo upload awaits backend support.'**
  String get mediaRemoteHint;

  /// No description provided for @mediaPickError.
  ///
  /// In en, this message translates to:
  /// **'Could not open or read the selected photos. Try again.'**
  String get mediaPickError;

  /// No description provided for @categoryVisible.
  ///
  /// In en, this message translates to:
  /// **'Visible to customers'**
  String get categoryVisible;

  /// No description provided for @adminAddMainCategory.
  ///
  /// In en, this message translates to:
  /// **'Add main category'**
  String get adminAddMainCategory;

  /// No description provided for @adminAddSubcategory.
  ///
  /// In en, this message translates to:
  /// **'Add subcategory'**
  String get adminAddSubcategory;

  /// No description provided for @adminBackToCategories.
  ///
  /// In en, this message translates to:
  /// **'Main categories'**
  String get adminBackToCategories;

  /// No description provided for @adminChooseCategory.
  ///
  /// In en, this message translates to:
  /// **'Choose a main category to manage its subcategories'**
  String get adminChooseCategory;

  /// No description provided for @adminSubcategoryCount.
  ///
  /// In en, this message translates to:
  /// **'{count} subcategories'**
  String adminSubcategoryCount(String count);

  /// No description provided for @adminDisplayOrderValue.
  ///
  /// In en, this message translates to:
  /// **'Display order: {order}'**
  String adminDisplayOrderValue(String order);

  /// No description provided for @adminMainCategoryFilter.
  ///
  /// In en, this message translates to:
  /// **'Main category'**
  String get adminMainCategoryFilter;

  /// No description provided for @adminSubcategoryFilter.
  ///
  /// In en, this message translates to:
  /// **'Subcategory'**
  String get adminSubcategoryFilter;

  /// No description provided for @adminAllProducts.
  ///
  /// In en, this message translates to:
  /// **'All products'**
  String get adminAllProducts;

  /// No description provided for @adminAllSubcategories.
  ///
  /// In en, this message translates to:
  /// **'Whole category'**
  String get adminAllSubcategories;

  /// No description provided for @adminProductScope.
  ///
  /// In en, this message translates to:
  /// **'Scope: {scope}'**
  String adminProductScope(String scope);

  /// No description provided for @adminSearchAllProducts.
  ///
  /// In en, this message translates to:
  /// **'Search all products'**
  String get adminSearchAllProducts;

  /// No description provided for @mediaPrimary.
  ///
  /// In en, this message translates to:
  /// **'Primary image'**
  String get mediaPrimary;

  /// No description provided for @mediaMakePrimary.
  ///
  /// In en, this message translates to:
  /// **'Make primary'**
  String get mediaMakePrimary;

  /// No description provided for @mediaPrimaryHint.
  ///
  /// In en, this message translates to:
  /// **'The first image is primary. Reordering changes the primary image.'**
  String get mediaPrimaryHint;

  /// No description provided for @mediaRemoveConfirm.
  ///
  /// In en, this message translates to:
  /// **'Remove this image?'**
  String get mediaRemoveConfirm;

  /// No description provided for @mediaRemoveMessage.
  ///
  /// In en, this message translates to:
  /// **'Only this image will be removed from the draft. The category or product will remain.'**
  String get mediaRemoveMessage;

  /// No description provided for @mediaRemovePrimaryMessage.
  ///
  /// In en, this message translates to:
  /// **'Remove the primary image from the draft? The product will remain, and the first remaining image (if any) will become primary.'**
  String get mediaRemovePrimaryMessage;

  /// No description provided for @mediaProductGuidance.
  ///
  /// In en, this message translates to:
  /// **'Square (1:1) works best. Choose a clear original for zooming; the display crops edges without stretching.'**
  String get mediaProductGuidance;

  /// No description provided for @mediaMainCategoryGuidance.
  ///
  /// In en, this message translates to:
  /// **'Use a landscape photo with the subject in the center. The crop ratio changes with the card width.'**
  String get mediaMainCategoryGuidance;

  /// No description provided for @mediaSubcategoryGuidance.
  ///
  /// In en, this message translates to:
  /// **'Saved for future use. Current subcategory tiles show the icon, so no photo ratio is required yet.'**
  String get mediaSubcategoryGuidance;

  /// No description provided for @adminViewSubcategories.
  ///
  /// In en, this message translates to:
  /// **'View subcategories'**
  String get adminViewSubcategories;

  /// No description provided for @adminRetainedProductCategory.
  ///
  /// In en, this message translates to:
  /// **'The current category is retained but unavailable for new assignments. Keep it for this product or choose another category to change it.'**
  String get adminRetainedProductCategory;

  /// No description provided for @adminDiscountType.
  ///
  /// In en, this message translates to:
  /// **'Discount type'**
  String get adminDiscountType;

  /// No description provided for @adminDiscountNone.
  ///
  /// In en, this message translates to:
  /// **'No discount'**
  String get adminDiscountNone;

  /// No description provided for @adminDiscountPercentage.
  ///
  /// In en, this message translates to:
  /// **'Percentage'**
  String get adminDiscountPercentage;

  /// No description provided for @adminDiscountAmount.
  ///
  /// In en, this message translates to:
  /// **'Fixed amount'**
  String get adminDiscountAmount;

  /// No description provided for @adminDiscountValue.
  ///
  /// In en, this message translates to:
  /// **'Discount value'**
  String get adminDiscountValue;

  /// No description provided for @adminDiscountStartsAt.
  ///
  /// In en, this message translates to:
  /// **'Discount starts'**
  String get adminDiscountStartsAt;

  /// No description provided for @adminDiscountEndsAt.
  ///
  /// In en, this message translates to:
  /// **'Discount ends'**
  String get adminDiscountEndsAt;

  /// No description provided for @adminDiscountDateHint.
  ///
  /// In en, this message translates to:
  /// **'Optional; UTC example: 2026-10-01T09:00:00Z'**
  String get adminDiscountDateHint;

  /// No description provided for @adminDiscountDateInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid date and time with timezone, e.g. 2026-10-01T09:00:00Z'**
  String get adminDiscountDateInvalid;

  /// No description provided for @adminCategorySlug.
  ///
  /// In en, this message translates to:
  /// **'Category URL slug'**
  String get adminCategorySlug;

  /// No description provided for @addressInternationalPhoneHint.
  ///
  /// In en, this message translates to:
  /// **'Use an international number starting with + and country code; no country code is added automatically.'**
  String get addressInternationalPhoneHint;

  /// No description provided for @mediaUploadHint.
  ///
  /// In en, this message translates to:
  /// **'Images upload when saved. JPEG, PNG, WebP or AVIF, up to 8 MiB per image.'**
  String get mediaUploadHint;

  /// No description provided for @orderStatusReadyForDispatch.
  ///
  /// In en, this message translates to:
  /// **'Ready for dispatch'**
  String get orderStatusReadyForDispatch;

  /// No description provided for @roleMonitor.
  ///
  /// In en, this message translates to:
  /// **'Order monitor'**
  String get roleMonitor;

  /// No description provided for @monitorTitle.
  ///
  /// In en, this message translates to:
  /// **'Order monitoring'**
  String get monitorTitle;

  /// No description provided for @notificationsTitle.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notificationsTitle;

  /// No description provided for @notificationsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No notifications yet'**
  String get notificationsEmpty;

  /// No description provided for @actionLoadMore.
  ///
  /// In en, this message translates to:
  /// **'Load more'**
  String get actionLoadMore;

  /// No description provided for @quantityInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a quantity within the limits, with up to 3 decimal places.'**
  String get quantityInvalid;

  /// No description provided for @quantityWholeInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a whole quantity within the limits.'**
  String get quantityWholeInvalid;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['ar', 'en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'ar':
      return AppLocalizationsAr();
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
