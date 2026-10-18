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

  /// No description provided for @productReviewsPreview.
  ///
  /// In en, this message translates to:
  /// **'Showing {shown} of {total} reviews — preview'**
  String productReviewsPreview(String shown, String total);

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
  /// **'Your personal details, addresses and sign-in sessions will be removed. Anonymized order and financial records are retained as required. This cannot be undone.'**
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
  /// **'You have already reviewed all items in this order.'**
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
  /// **'Reason for all selected items (required)'**
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
  /// **'There are no remaining quantities available to request for return.'**
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
  /// **'Choose a country and enter a local number, or enter the full international number with +.'**
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

  /// No description provided for @notificationsUnreadCount.
  ///
  /// In en, this message translates to:
  /// **'Notifications, unread: {count}'**
  String notificationsUnreadCount(String count);

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

  /// No description provided for @checkoutPricesChanged.
  ///
  /// In en, this message translates to:
  /// **'Prices changed'**
  String get checkoutPricesChanged;

  /// No description provided for @checkoutPricesChangedMessage.
  ///
  /// In en, this message translates to:
  /// **'Review the new unit prices before placing your order. The server will calculate the final total.'**
  String get checkoutPricesChangedMessage;

  /// No description provided for @checkoutAcceptPrices.
  ///
  /// In en, this message translates to:
  /// **'Accept prices and place order'**
  String get checkoutAcceptPrices;

  /// No description provided for @cartPricesChanged.
  ///
  /// In en, this message translates to:
  /// **'Some prices changed. You will be asked to review and accept them at checkout.'**
  String get cartPricesChanged;

  /// No description provided for @deliveryFailureReason.
  ///
  /// In en, this message translates to:
  /// **'Reason for failed delivery'**
  String get deliveryFailureReason;

  /// No description provided for @deliveryRetryCount.
  ///
  /// In en, this message translates to:
  /// **'Retry count'**
  String get deliveryRetryCount;

  /// No description provided for @orderStateConflict.
  ///
  /// In en, this message translates to:
  /// **'This order changed or can no longer be cancelled. Please review its latest status.'**
  String get orderStateConflict;

  /// No description provided for @errorConflict.
  ///
  /// In en, this message translates to:
  /// **'This action conflicts with the current state. Refresh and review before trying again.'**
  String get errorConflict;

  /// No description provided for @startupConfigurationError.
  ///
  /// In en, this message translates to:
  /// **'This build has an invalid production API configuration. Contact support for a corrected build.'**
  String get startupConfigurationError;

  /// No description provided for @deliveryAmountDue.
  ///
  /// In en, this message translates to:
  /// **'Amount due'**
  String get deliveryAmountDue;

  /// No description provided for @deliveryCollectionConfirmation.
  ///
  /// In en, this message translates to:
  /// **'Payment collection'**
  String get deliveryCollectionConfirmation;

  /// No description provided for @deliveryCollectionConfirmed.
  ///
  /// In en, this message translates to:
  /// **'Payment collected'**
  String get deliveryCollectionConfirmed;

  /// No description provided for @deliveryCollectionUnconfirmed.
  ///
  /// In en, this message translates to:
  /// **'Amount not confirmed'**
  String get deliveryCollectionUnconfirmed;

  /// No description provided for @deliveryCollectionUnconfirmedHint.
  ///
  /// In en, this message translates to:
  /// **'The order is delivered now; the store confirms the amount later.'**
  String get deliveryCollectionUnconfirmedHint;

  /// No description provided for @deliveryCollectedAmount.
  ///
  /// In en, this message translates to:
  /// **'Amount collected'**
  String get deliveryCollectedAmount;

  /// No description provided for @deliveryInvalidAmount.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid recorded amount up to the order total (at most 6 decimal places).'**
  String get deliveryInvalidAmount;

  /// No description provided for @pendingDeliveryRetry.
  ///
  /// In en, this message translates to:
  /// **'The previous result is unknown. Retry the same collection; its amount cannot be changed until the result is known.'**
  String get pendingDeliveryRetry;

  /// No description provided for @pendingRequestMessage.
  ///
  /// In en, this message translates to:
  /// **'A previous request is unresolved. Retry with the same selection and amount or quantity.'**
  String get pendingRequestMessage;

  /// No description provided for @checkoutPendingRecovery.
  ///
  /// In en, this message translates to:
  /// **'A previous checkout has an unknown result. Resolve it before placing another order. This retries the original request, even if your cart is now empty.'**
  String get checkoutPendingRecovery;

  /// No description provided for @checkoutResolvePending.
  ///
  /// In en, this message translates to:
  /// **'Resolve previous checkout'**
  String get checkoutResolvePending;

  /// No description provided for @orderRequestCancellation.
  ///
  /// In en, this message translates to:
  /// **'Request cancellation'**
  String get orderRequestCancellation;

  /// No description provided for @orderCancellationReason.
  ///
  /// In en, this message translates to:
  /// **'Reason for cancellation'**
  String get orderCancellationReason;

  /// No description provided for @orderCancellationRequestSent.
  ///
  /// In en, this message translates to:
  /// **'Cancellation request sent to the store.'**
  String get orderCancellationRequestSent;

  /// No description provided for @orderCancellationPending.
  ///
  /// In en, this message translates to:
  /// **'Cancellation request pending'**
  String get orderCancellationPending;

  /// No description provided for @orderCancellationApproved.
  ///
  /// In en, this message translates to:
  /// **'Cancellation request approved'**
  String get orderCancellationApproved;

  /// No description provided for @orderCancellationDenied.
  ///
  /// In en, this message translates to:
  /// **'Cancellation request declined'**
  String get orderCancellationDenied;

  /// No description provided for @orderReductionTitle.
  ///
  /// In en, this message translates to:
  /// **'Quantity change proposed'**
  String get orderReductionTitle;

  /// No description provided for @orderReductionQuantities.
  ///
  /// In en, this message translates to:
  /// **'Original quantity: {oldQuantity}. Proposed quantity: {newQuantity}.'**
  String orderReductionQuantities(String oldQuantity, String newQuantity);

  /// No description provided for @orderReductionAccept.
  ///
  /// In en, this message translates to:
  /// **'Accept reduced quantity'**
  String get orderReductionAccept;

  /// No description provided for @orderReductionDecline.
  ///
  /// In en, this message translates to:
  /// **'Decline reduced quantity'**
  String get orderReductionDecline;

  /// No description provided for @orderReductionAcceptConfirm.
  ///
  /// In en, this message translates to:
  /// **'Accept the displayed reduced quantity? The store will update the order totals.'**
  String get orderReductionAcceptConfirm;

  /// No description provided for @orderReductionDeclineConfirm.
  ///
  /// In en, this message translates to:
  /// **'Decline this quantity change? The store will review your order.'**
  String get orderReductionDeclineConfirm;

  /// No description provided for @orderDecisionSaved.
  ///
  /// In en, this message translates to:
  /// **'Your response has been saved.'**
  String get orderDecisionSaved;

  /// No description provided for @productLowStockLabel.
  ///
  /// In en, this message translates to:
  /// **'Low stock'**
  String get productLowStockLabel;

  /// No description provided for @pushSettings.
  ///
  /// In en, this message translates to:
  /// **'Notification Settings'**
  String get pushSettings;

  /// No description provided for @pushSettingsUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Unable to open notification settings. Open the app in your device settings.'**
  String get pushSettingsUnavailable;

  /// No description provided for @pushEnable.
  ///
  /// In en, this message translates to:
  /// **'Enable push notifications'**
  String get pushEnable;

  /// No description provided for @pushEnabled.
  ///
  /// In en, this message translates to:
  /// **'Push notifications are enabled.'**
  String get pushEnabled;

  /// No description provided for @pushDenied.
  ///
  /// In en, this message translates to:
  /// **'Notifications are disabled. Allow them in your device settings, then try again.'**
  String get pushDenied;

  /// No description provided for @pushPending.
  ///
  /// In en, this message translates to:
  /// **'Device registration is not ready yet. Please try again shortly.'**
  String get pushPending;

  /// No description provided for @pushUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Push notifications are not configured for this build yet.'**
  String get pushUnavailable;

  /// No description provided for @pushReceived.
  ///
  /// In en, this message translates to:
  /// **'You have a new notification.'**
  String get pushReceived;

  /// No description provided for @errorCheckoutIdentity.
  ///
  /// In en, this message translates to:
  /// **'This checkout conflicts with a previous request. Resolve the previous checkout before trying again.'**
  String get errorCheckoutIdentity;

  /// No description provided for @errorCartEmpty.
  ///
  /// In en, this message translates to:
  /// **'Your cart is empty. Add items before checking out.'**
  String get errorCartEmpty;

  /// No description provided for @errorCartQuantity.
  ///
  /// In en, this message translates to:
  /// **'A cart quantity is invalid. Review and update your quantities.'**
  String get errorCartQuantity;

  /// No description provided for @errorCartUnavailable.
  ///
  /// In en, this message translates to:
  /// **'An item is no longer available. Review your cart and remove or replace it.'**
  String get errorCartUnavailable;

  /// No description provided for @errorStockShortage.
  ///
  /// In en, this message translates to:
  /// **'The requested quantity is no longer available. Review the updated stock and choose a smaller quantity.'**
  String get errorStockShortage;

  /// No description provided for @errorWholeUnits.
  ///
  /// In en, this message translates to:
  /// **'This item is sold in whole units. Enter a whole-number quantity.'**
  String get errorWholeUnits;

  /// No description provided for @errorCouponInvalid.
  ///
  /// In en, this message translates to:
  /// **'This coupon cannot be used. Remove it or enter another code.'**
  String get errorCouponInvalid;

  /// No description provided for @errorPriceChanged.
  ///
  /// In en, this message translates to:
  /// **'Prices have changed. Review the latest prices before confirming your order.'**
  String get errorPriceChanged;

  /// No description provided for @errorOrderAccess.
  ///
  /// In en, this message translates to:
  /// **'This order is not available to your account. Return to your orders list.'**
  String get errorOrderAccess;

  /// No description provided for @errorCancellationNotAllowed.
  ///
  /// In en, this message translates to:
  /// **'Cancellation is not available in the current order state. Review the updated order.'**
  String get errorCancellationNotAllowed;

  /// No description provided for @errorCancellationPending.
  ///
  /// In en, this message translates to:
  /// **'A cancellation request is already pending for this order.'**
  String get errorCancellationPending;

  /// No description provided for @errorReductionResolved.
  ///
  /// In en, this message translates to:
  /// **'This quantity proposal is no longer pending. Review the updated order.'**
  String get errorReductionResolved;

  /// No description provided for @errorPaidCancellation.
  ///
  /// In en, this message translates to:
  /// **'This paid order cannot be cancelled here. Contact the store for help.'**
  String get errorPaidCancellation;

  /// No description provided for @privacyPolicyUnavailable.
  ///
  /// In en, this message translates to:
  /// **'The privacy policy has not been published yet. Please try again after the app is configured.'**
  String get privacyPolicyUnavailable;

  /// No description provided for @privacyPolicyOpenFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not open the privacy policy. Please try again.'**
  String get privacyPolicyOpenFailed;

  /// No description provided for @accountDeletionBlocked.
  ///
  /// In en, this message translates to:
  /// **'Your account cannot be deleted while orders, returns or amounts remain unresolved.'**
  String get accountDeletionBlocked;

  /// No description provided for @accountDeletionOpenOrders.
  ///
  /// In en, this message translates to:
  /// **'Complete or cancel your open orders before deleting your account.'**
  String get accountDeletionOpenOrders;

  /// No description provided for @accountDeletionPendingReturns.
  ///
  /// In en, this message translates to:
  /// **'Wait for your pending returns to be resolved before deleting your account.'**
  String get accountDeletionPendingReturns;

  /// No description provided for @accountDeletionUnsettled.
  ///
  /// In en, this message translates to:
  /// **'Settle outstanding amounts before deleting your account.'**
  String get accountDeletionUnsettled;

  /// No description provided for @productUnavailableTitle.
  ///
  /// In en, this message translates to:
  /// **'Product unavailable'**
  String get productUnavailableTitle;

  /// No description provided for @productUnavailableMessage.
  ///
  /// In en, this message translates to:
  /// **'This product is no longer available. Please browse the catalog for other products.'**
  String get productUnavailableMessage;

  /// No description provided for @supportUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Customer support contact details are not available yet. Please try again later.'**
  String get supportUnavailable;

  /// No description provided for @supportOpenFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not open customer support. Please try again.'**
  String get supportOpenFailed;

  /// No description provided for @orderRequestDate.
  ///
  /// In en, this message translates to:
  /// **'Requested'**
  String get orderRequestDate;

  /// No description provided for @orderResolutionDate.
  ///
  /// In en, this message translates to:
  /// **'Resolved'**
  String get orderResolutionDate;

  /// No description provided for @orderResolutionNote.
  ///
  /// In en, this message translates to:
  /// **'Resolution note'**
  String get orderResolutionNote;

  /// No description provided for @orderAcceptedPrices.
  ///
  /// In en, this message translates to:
  /// **'Accepted price changes'**
  String get orderAcceptedPrices;

  /// No description provided for @orderStockAttention.
  ///
  /// In en, this message translates to:
  /// **'Order quantity shortage'**
  String get orderStockAttention;

  /// No description provided for @orderShortageQuantities.
  ///
  /// In en, this message translates to:
  /// **'Requested: {requested} · Allocated: {allocated} · Short: {short}'**
  String orderShortageQuantities(
    String requested,
    String allocated,
    String short,
  );

  /// No description provided for @orderPaidOnDelivery.
  ///
  /// In en, this message translates to:
  /// **'Paid on delivery'**
  String get orderPaidOnDelivery;

  /// No description provided for @orderStillOwed.
  ///
  /// In en, this message translates to:
  /// **'Still owed'**
  String get orderStillOwed;

  /// No description provided for @orderCollectionUnconfirmed.
  ///
  /// In en, this message translates to:
  /// **'Payment is awaiting confirmation'**
  String get orderCollectionUnconfirmed;

  /// No description provided for @orderReductionAccepted.
  ///
  /// In en, this message translates to:
  /// **'Quantity change accepted'**
  String get orderReductionAccepted;

  /// No description provided for @orderReductionDenied.
  ///
  /// In en, this message translates to:
  /// **'Quantity change declined'**
  String get orderReductionDenied;

  /// No description provided for @errorWorkAccountShopping.
  ///
  /// In en, this message translates to:
  /// **'Shopping is available to customer accounts. Sign in with a customer account.'**
  String get errorWorkAccountShopping;

  /// No description provided for @errorAppRoleForbidden.
  ///
  /// In en, this message translates to:
  /// **'Your account role cannot perform this action.'**
  String get errorAppRoleForbidden;

  /// No description provided for @errorAuthSurfaceForbidden.
  ///
  /// In en, this message translates to:
  /// **'This sign-in cannot be used in the customer app. Sign in again through the app.'**
  String get errorAuthSurfaceForbidden;

  /// No description provided for @stockShortageTitle.
  ///
  /// In en, this message translates to:
  /// **'Quantity unavailable'**
  String get stockShortageTitle;

  /// No description provided for @stockAvailableQuantity.
  ///
  /// In en, this message translates to:
  /// **'Available quantity: {quantity}'**
  String stockAvailableQuantity(String quantity);

  /// No description provided for @stockRequestedQuantity.
  ///
  /// In en, this message translates to:
  /// **'Requested quantity: {quantity}'**
  String stockRequestedQuantity(String quantity);

  /// No description provided for @stockCorrectCart.
  ///
  /// In en, this message translates to:
  /// **'Correct cart'**
  String get stockCorrectCart;

  /// No description provided for @addressGovernorate.
  ///
  /// In en, this message translates to:
  /// **'Governorate'**
  String get addressGovernorate;

  /// No description provided for @errorAddressGovernorateRequired.
  ///
  /// In en, this message translates to:
  /// **'Select a governorate in your delivery address before placing the order.'**
  String get errorAddressGovernorateRequired;

  /// No description provided for @errorDeliveryZoneNotServed.
  ///
  /// In en, this message translates to:
  /// **'Delivery is currently unavailable for this governorate. Choose an address in a served area or contact the store.'**
  String get errorDeliveryZoneNotServed;

  /// No description provided for @errorDeliveryLocationSelector.
  ///
  /// In en, this message translates to:
  /// **'Could not determine the delivery location. Select your delivery address again.'**
  String get errorDeliveryLocationSelector;

  /// No description provided for @returnDetailsTitle.
  ///
  /// In en, this message translates to:
  /// **'Return details'**
  String get returnDetailsTitle;

  /// No description provided for @returnHistoryTitle.
  ///
  /// In en, this message translates to:
  /// **'Returns'**
  String get returnHistoryTitle;

  /// No description provided for @returnReasonCode.
  ///
  /// In en, this message translates to:
  /// **'Reason category'**
  String get returnReasonCode;

  /// No description provided for @returnChangeMind.
  ///
  /// In en, this message translates to:
  /// **'Changed my mind'**
  String get returnChangeMind;

  /// No description provided for @returnDefect.
  ///
  /// In en, this message translates to:
  /// **'Defective item'**
  String get returnDefect;

  /// No description provided for @returnStoreError.
  ///
  /// In en, this message translates to:
  /// **'Store error'**
  String get returnStoreError;

  /// No description provided for @returnWrongItem.
  ///
  /// In en, this message translates to:
  /// **'Wrong item'**
  String get returnWrongItem;

  /// No description provided for @returnOther.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get returnOther;

  /// No description provided for @returnRequested.
  ///
  /// In en, this message translates to:
  /// **'Requested'**
  String get returnRequested;

  /// No description provided for @returnApproved.
  ///
  /// In en, this message translates to:
  /// **'Approved'**
  String get returnApproved;

  /// No description provided for @returnPartiallyApproved.
  ///
  /// In en, this message translates to:
  /// **'Partially approved'**
  String get returnPartiallyApproved;

  /// No description provided for @returnRejected.
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get returnRejected;

  /// No description provided for @returnReceived.
  ///
  /// In en, this message translates to:
  /// **'Received by store'**
  String get returnReceived;

  /// No description provided for @returnInspected.
  ///
  /// In en, this message translates to:
  /// **'Inspected'**
  String get returnInspected;

  /// No description provided for @returnRefunded.
  ///
  /// In en, this message translates to:
  /// **'Refunded'**
  String get returnRefunded;

  /// No description provided for @returnCompleted.
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get returnCompleted;

  /// No description provided for @returnExpectedRefund.
  ///
  /// In en, this message translates to:
  /// **'Estimated goods refund'**
  String get returnExpectedRefund;

  /// No description provided for @returnApprovedRefund.
  ///
  /// In en, this message translates to:
  /// **'Approved refund'**
  String get returnApprovedRefund;

  /// No description provided for @returnDeliveryRefund.
  ///
  /// In en, this message translates to:
  /// **'Delivery fee refund'**
  String get returnDeliveryRefund;

  /// No description provided for @returnUncollectedOffset.
  ///
  /// In en, this message translates to:
  /// **'Reduction of unpaid amount'**
  String get returnUncollectedOffset;

  /// No description provided for @returnCashRefund.
  ///
  /// In en, this message translates to:
  /// **'Cash refund'**
  String get returnCashRefund;

  /// No description provided for @returnPointsNote.
  ///
  /// In en, this message translates to:
  /// **'Points adjustments affect your loyalty balance, not an extra deduction from your cash refund.'**
  String get returnPointsNote;

  /// No description provided for @returnEarnedReversed.
  ///
  /// In en, this message translates to:
  /// **'Earned points reversed'**
  String get returnEarnedReversed;

  /// No description provided for @returnRedeemedRestored.
  ///
  /// In en, this message translates to:
  /// **'Redeemed points restored'**
  String get returnRedeemedRestored;

  /// No description provided for @returnNetPoints.
  ///
  /// In en, this message translates to:
  /// **'Net points adjustment'**
  String get returnNetPoints;

  /// No description provided for @returnRequestedQuantity.
  ///
  /// In en, this message translates to:
  /// **'Requested quantity'**
  String get returnRequestedQuantity;

  /// No description provided for @returnApprovedQuantity.
  ///
  /// In en, this message translates to:
  /// **'Approved quantity'**
  String get returnApprovedQuantity;

  /// No description provided for @returnTimeline.
  ///
  /// In en, this message translates to:
  /// **'Status history'**
  String get returnTimeline;

  /// No description provided for @returnPayments.
  ///
  /// In en, this message translates to:
  /// **'Refund payments'**
  String get returnPayments;

  /// No description provided for @returnCashAccount.
  ///
  /// In en, this message translates to:
  /// **'Store cash payment'**
  String get returnCashAccount;

  /// No description provided for @returnDeliveryCustody.
  ///
  /// In en, this message translates to:
  /// **'Delivery collection refund'**
  String get returnDeliveryCustody;

  /// No description provided for @returnPendingNotice.
  ///
  /// In en, this message translates to:
  /// **'The result of your previous request is not yet confirmed. Retry that same request before starting another.'**
  String get returnPendingNotice;

  /// No description provided for @returnRetryPending.
  ///
  /// In en, this message translates to:
  /// **'Recover previous request'**
  String get returnRetryPending;

  /// No description provided for @returnWindowExpired.
  ///
  /// In en, this message translates to:
  /// **'The return period for this order has ended.'**
  String get returnWindowExpired;

  /// No description provided for @returnQuantityChanged.
  ///
  /// In en, this message translates to:
  /// **'The available return quantity has changed. Refresh the order and try again.'**
  String get returnQuantityChanged;

  /// No description provided for @returnQuantityInvalid.
  ///
  /// In en, this message translates to:
  /// **'Check the return quantities and unit precision.'**
  String get returnQuantityInvalid;

  /// No description provided for @returnNotDelivered.
  ///
  /// In en, this message translates to:
  /// **'Returns are available only for delivered orders.'**
  String get returnNotDelivered;

  /// No description provided for @otpDeliveryUnavailable.
  ///
  /// In en, this message translates to:
  /// **'We could not send the verification code. Please try again later.'**
  String get otpDeliveryUnavailable;

  /// No description provided for @pricingCouponDiscount.
  ///
  /// In en, this message translates to:
  /// **'Coupon discount'**
  String get pricingCouponDiscount;

  /// No description provided for @pricingTierDiscount.
  ///
  /// In en, this message translates to:
  /// **'Automatic discount'**
  String get pricingTierDiscount;

  /// No description provided for @pricingLoyaltyDiscount.
  ///
  /// In en, this message translates to:
  /// **'Points used'**
  String get pricingLoyaltyDiscount;

  /// No description provided for @pricingOriginalDelivery.
  ///
  /// In en, this message translates to:
  /// **'Original delivery fee'**
  String get pricingOriginalDelivery;

  /// No description provided for @pricingAdjustedDelivery.
  ///
  /// In en, this message translates to:
  /// **'Adjusted delivery fee'**
  String get pricingAdjustedDelivery;

  /// No description provided for @pricingNetPaid.
  ///
  /// In en, this message translates to:
  /// **'Net paid for this line'**
  String get pricingNetPaid;

  /// No description provided for @pricingDeliveryGovernorate.
  ///
  /// In en, this message translates to:
  /// **'Delivery governorate'**
  String get pricingDeliveryGovernorate;

  /// No description provided for @pricingEstimate.
  ///
  /// In en, this message translates to:
  /// **'Estimated total — final pricing is confirmed at checkout.'**
  String get pricingEstimate;

  /// No description provided for @pricingSelectGovernorate.
  ///
  /// In en, this message translates to:
  /// **'Choose a governorate to estimate delivery'**
  String get pricingSelectGovernorate;

  /// No description provided for @pricingUnserved.
  ///
  /// In en, this message translates to:
  /// **'Delivery is not available to this governorate.'**
  String get pricingUnserved;

  /// No description provided for @pricingStacking.
  ///
  /// In en, this message translates to:
  /// **'Coupons can combine with automatic discounts.'**
  String get pricingStacking;

  /// No description provided for @pricingBestDiscount.
  ///
  /// In en, this message translates to:
  /// **'The larger of the coupon and automatic discount applies.'**
  String get pricingBestDiscount;

  /// No description provided for @pricingDeliveryUnknown.
  ///
  /// In en, this message translates to:
  /// **'Delivery fee is not included until a location is selected.'**
  String get pricingDeliveryUnknown;

  /// No description provided for @storeInfoTitle.
  ///
  /// In en, this message translates to:
  /// **'Store information'**
  String get storeInfoTitle;

  /// No description provided for @storeAddress.
  ///
  /// In en, this message translates to:
  /// **'Store address'**
  String get storeAddress;

  /// No description provided for @storeSupportHours.
  ///
  /// In en, this message translates to:
  /// **'Support hours'**
  String get storeSupportHours;

  /// No description provided for @storeSupportPhone.
  ///
  /// In en, this message translates to:
  /// **'Call support'**
  String get storeSupportPhone;

  /// No description provided for @storeSupportWhatsapp.
  ///
  /// In en, this message translates to:
  /// **'WhatsApp support'**
  String get storeSupportWhatsapp;

  /// No description provided for @storeSupportEmail.
  ///
  /// In en, this message translates to:
  /// **'Support email'**
  String get storeSupportEmail;

  /// No description provided for @storePrivacyEmail.
  ///
  /// In en, this message translates to:
  /// **'Privacy contact'**
  String get storePrivacyEmail;

  /// No description provided for @storePolicyDate.
  ///
  /// In en, this message translates to:
  /// **'Policy effective date'**
  String get storePolicyDate;

  /// No description provided for @loyaltyInsufficient.
  ///
  /// In en, this message translates to:
  /// **'Your points balance is insufficient. Refresh and try again.'**
  String get loyaltyInsufficient;

  /// No description provided for @loyaltyExceedsGoods.
  ///
  /// In en, this message translates to:
  /// **'Points cannot exceed the remaining goods value or pay delivery fees.'**
  String get loyaltyExceedsGoods;

  /// No description provided for @pricingNextTier.
  ///
  /// In en, this message translates to:
  /// **'Add {amount} to reach a {percent}% automatic discount.'**
  String pricingNextTier(String amount, String percent);

  /// No description provided for @storeReturnWindow.
  ///
  /// In en, this message translates to:
  /// **'Return window: {days} days'**
  String storeReturnWindow(String days);

  /// No description provided for @storeRefundDays.
  ///
  /// In en, this message translates to:
  /// **'Refund processing: {days} days'**
  String storeRefundDays(String days);

  /// No description provided for @accountDeletionCounts.
  ///
  /// In en, this message translates to:
  /// **'Open orders: {orders}; pending returns: {returns}; unsettled amounts: {unsettled}.'**
  String accountDeletionCounts(String orders, String returns, String unsettled);

  /// No description provided for @shoppingInformation.
  ///
  /// In en, this message translates to:
  /// **'Delivery and automatic discounts'**
  String get shoppingInformation;

  /// No description provided for @pricingTierThreshold.
  ///
  /// In en, this message translates to:
  /// **'{percent}% off goods subtotals of {amount} or more.'**
  String pricingTierThreshold(String amount, String percent);

  /// No description provided for @deliveryViewDetails.
  ///
  /// In en, this message translates to:
  /// **'View details'**
  String get deliveryViewDetails;

  /// No description provided for @deliveryDetailsTitle.
  ///
  /// In en, this message translates to:
  /// **'Delivery details'**
  String get deliveryDetailsTitle;

  /// No description provided for @deliveryOrderTotal.
  ///
  /// In en, this message translates to:
  /// **'Order total'**
  String get deliveryOrderTotal;

  /// No description provided for @deliveryTotalNotBalance.
  ///
  /// In en, this message translates to:
  /// **'Order value, not a confirmed remaining collection balance.'**
  String get deliveryTotalNotBalance;

  /// No description provided for @deliveryCollectionUnknown.
  ///
  /// In en, this message translates to:
  /// **'Collection information unavailable'**
  String get deliveryCollectionUnknown;

  /// No description provided for @deliveryCollectionFull.
  ///
  /// In en, this message translates to:
  /// **'Store collection confirmed in full'**
  String get deliveryCollectionFull;

  /// No description provided for @deliveryCollectionShort.
  ///
  /// In en, this message translates to:
  /// **'Store collection confirmed with a shortfall'**
  String get deliveryCollectionShort;

  /// No description provided for @deliveryRecordedCollection.
  ///
  /// In en, this message translates to:
  /// **'Recorded store collection'**
  String get deliveryRecordedCollection;

  /// No description provided for @deliveryRecordedShortfall.
  ///
  /// In en, this message translates to:
  /// **'Recorded collection shortfall'**
  String get deliveryRecordedShortfall;

  /// No description provided for @deliveryCollectionRecordNote.
  ///
  /// In en, this message translates to:
  /// **'This record is not an instruction to collect additional money.'**
  String get deliveryCollectionRecordNote;

  /// No description provided for @deliveryRecipientTitle.
  ///
  /// In en, this message translates to:
  /// **'Recipient and delivery address'**
  String get deliveryRecipientTitle;

  /// No description provided for @deliveryContactHidden.
  ///
  /// In en, this message translates to:
  /// **'Contact details are hidden after completion or while access is being checked.'**
  String get deliveryContactHidden;

  /// No description provided for @deliveryNameUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Recipient name unavailable'**
  String get deliveryNameUnavailable;

  /// No description provided for @deliveryPhoneUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Delivery phone unavailable'**
  String get deliveryPhoneUnavailable;

  /// No description provided for @deliveryAddressUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Delivery address unavailable'**
  String get deliveryAddressUnavailable;

  /// No description provided for @deliveryCopyReference.
  ///
  /// In en, this message translates to:
  /// **'Copy order reference'**
  String get deliveryCopyReference;

  /// No description provided for @deliveryCopyAddress.
  ///
  /// In en, this message translates to:
  /// **'Copy address'**
  String get deliveryCopyAddress;

  /// No description provided for @deliveryCallRecipient.
  ///
  /// In en, this message translates to:
  /// **'Call recipient'**
  String get deliveryCallRecipient;

  /// No description provided for @deliveryOpenMap.
  ///
  /// In en, this message translates to:
  /// **'Open map'**
  String get deliveryOpenMap;

  /// No description provided for @deliveryCopied.
  ///
  /// In en, this message translates to:
  /// **'Copied'**
  String get deliveryCopied;

  /// No description provided for @deliveryActionFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not complete this action. Please try again.'**
  String get deliveryActionFailed;

  /// No description provided for @deliveryInvoiceTitle.
  ///
  /// In en, this message translates to:
  /// **'Order value and collection'**
  String get deliveryInvoiceTitle;

  /// No description provided for @deliveryInvoiceBreakdownUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Discount breakdown and payment method are not available in these delivery details.'**
  String get deliveryInvoiceBreakdownUnavailable;

  /// No description provided for @deliveryLineTotal.
  ///
  /// In en, this message translates to:
  /// **'Line total'**
  String get deliveryLineTotal;

  /// No description provided for @deliveryHistoryTitle.
  ///
  /// In en, this message translates to:
  /// **'Delivery history'**
  String get deliveryHistoryTitle;

  /// No description provided for @deliveryDetailUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Delivery no longer available'**
  String get deliveryDetailUnavailable;

  /// No description provided for @deliveryDetailUnavailableHint.
  ///
  /// In en, this message translates to:
  /// **'It may have been reassigned. Return to the delivery list and refresh.'**
  String get deliveryDetailUnavailableHint;

  /// No description provided for @deliveryPeriodClosed.
  ///
  /// In en, this message translates to:
  /// **'The accounting period is closed. Contact the store before updating this delivery.'**
  String get deliveryPeriodClosed;

  /// No description provided for @deliveryFareMismatch.
  ///
  /// In en, this message translates to:
  /// **'The trip fare needs review by the store before delivery can be confirmed.'**
  String get deliveryFareMismatch;

  /// No description provided for @phoneCountryCode.
  ///
  /// In en, this message translates to:
  /// **'Country code'**
  String get phoneCountryCode;

  /// No description provided for @phoneCountrySearch.
  ///
  /// In en, this message translates to:
  /// **'Search country or calling code'**
  String get phoneCountrySearch;

  /// No description provided for @authCodeSentTo.
  ///
  /// In en, this message translates to:
  /// **'We sent a verification code to'**
  String get authCodeSentTo;

  /// No description provided for @notificationsMarkAllRead.
  ///
  /// In en, this message translates to:
  /// **'Mark all as read'**
  String get notificationsMarkAllRead;
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
