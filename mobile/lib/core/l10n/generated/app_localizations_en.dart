// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get homeBrandName => 'Shubayr';

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
  String get cartEmptyTitle => 'Your cart is empty';

  @override
  String get cartEmptyMessage => 'Add products to start shopping.';

  @override
  String get cartSubtotal => 'Subtotal';

  @override
  String get cartCheckout => 'Checkout';

  @override
  String get cartRemove => 'Remove';

  @override
  String get cartAdded => 'Added to cart';

  @override
  String get cartViewCart => 'View cart';

  @override
  String get cartSignInPrompt => 'Sign in to add to cart';

  @override
  String get addressesTitle => 'Addresses';

  @override
  String get addressAdd => 'Add address';

  @override
  String get addressEdit => 'Edit address';

  @override
  String get addressEmptyTitle => 'No saved addresses';

  @override
  String get addressEmptyMessage =>
      'Add a delivery address to speed up checkout.';

  @override
  String get addressLabel => 'Label';

  @override
  String get addressCity => 'City';

  @override
  String get addressArea => 'Area';

  @override
  String get addressStreet => 'Street';

  @override
  String get addressDetails => 'More details';

  @override
  String get addressCityRequired => 'Enter the city.';

  @override
  String get addressSetDefault => 'Set as default';

  @override
  String get addressDefault => 'Default';

  @override
  String get addressDeleteTitle => 'Delete this address?';

  @override
  String get checkoutTitle => 'Checkout';

  @override
  String get checkoutAddress => 'Delivery address';

  @override
  String get checkoutChangeAddress => 'Change';

  @override
  String get checkoutCoupon => 'Discount coupon';

  @override
  String get checkoutCouponHint => 'Enter code';

  @override
  String get checkoutCouponInvalid => 'Invalid coupon code';

  @override
  String get checkoutDiscount => 'Discount';

  @override
  String get checkoutDelivery => 'Delivery fee';

  @override
  String get checkoutDeliveryNote => 'Calculated at confirmation';

  @override
  String get checkoutTotal => 'Total';

  @override
  String get checkoutPayment => 'Payment method';

  @override
  String get checkoutCod => 'Cash on delivery';

  @override
  String get checkoutPlaceOrder => 'Place order';

  @override
  String get checkoutSuccessTitle => 'Order placed';

  @override
  String get checkoutSuccessMessage =>
      'The courier will contact you to confirm delivery.';

  @override
  String get checkoutOrderNumber => 'Order number';

  @override
  String get checkoutBackHome => 'Back to shopping';

  @override
  String get checkoutViewOrders => 'View my orders';

  @override
  String get wishlistTitle => 'Wishlist';

  @override
  String get wishlistEmptyTitle => 'No saved products';

  @override
  String get wishlistEmptyMessage =>
      'Save products you like to find them here.';

  @override
  String get wishlistAdd => 'Add to wishlist';

  @override
  String get wishlistRemove => 'Remove from wishlist';

  @override
  String get wishlistSignInPrompt => 'Sign in to save to your wishlist';

  @override
  String get ordersTitle => 'Orders';

  @override
  String get ordersEmptyTitle => 'No orders yet';

  @override
  String get ordersEmptyMessage =>
      'Start shopping and your orders will appear here.';

  @override
  String get ordersFilterAll => 'All';

  @override
  String get ordersFilterEmpty => 'No orders with this status';

  @override
  String orderItemsCount(String count) {
    return '$count items';
  }

  @override
  String get orderDetailTitle => 'Order details';

  @override
  String get orderItemsSection => 'Items';

  @override
  String orderLineQuantity(String count) {
    return 'Qty: $count';
  }

  @override
  String get orderSummary => 'Order summary';

  @override
  String get orderDate => 'Order date';

  @override
  String get orderTrackingTitle => 'Order tracking';

  @override
  String get orderCancel => 'Cancel order';

  @override
  String get orderCancelTitle => 'Cancel this order?';

  @override
  String get orderCancelMessage => 'This can\'t be undone once cancelled.';

  @override
  String get orderKeepOrder => 'Keep order';

  @override
  String get orderCancelledDone => 'Order cancelled.';

  @override
  String get orderStatusPending => 'Pending';

  @override
  String get orderStatusConfirmed => 'Confirmed';

  @override
  String get orderStatusProcessing => 'Processing';

  @override
  String get orderStatusOutForDelivery => 'Out for delivery';

  @override
  String get orderStatusDelivered => 'Delivered';

  @override
  String get orderStatusFailedDelivery => 'Delivery failed';

  @override
  String get orderStatusCancelled => 'Cancelled';

  @override
  String get orderStatusReturnRequested => 'Return requested';

  @override
  String get orderStatusReturned => 'Returned';

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
  String get homeOffersTitle => 'Offers & Discounts';

  @override
  String get homeOffersViewAll => 'View all';

  @override
  String get homeSectionProducts => 'Products';

  @override
  String get productDescription => 'Description';

  @override
  String get productNegotiable => 'Negotiable';

  @override
  String get productAddToCart => 'Add to cart';

  @override
  String get productVariants => 'Options';

  @override
  String get productQuantity => 'Quantity';

  @override
  String get productInStock => 'In stock';

  @override
  String productLowStock(String count) {
    return 'Only $count left';
  }

  @override
  String get productReviews => 'Reviews';

  @override
  String get productNoReviews => 'No reviews yet';

  @override
  String productReviewsCount(String count) {
    return '$count reviews';
  }

  @override
  String get productVerifiedPurchase => 'Verified purchase';

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
  String get productFiltersSort => 'Sort by';

  @override
  String get productFiltersOffersOnly => 'Offers only';

  @override
  String get productFiltersClearAll => 'Clear all';

  @override
  String get productFiltersShowResults => 'Show results';

  @override
  String productFilterPriceRange(String min, String max) {
    return 'Price: $min–$max';
  }

  @override
  String productFilterPriceFrom(String min) {
    return 'Price: from $min';
  }

  @override
  String productFilterPriceTo(String max) {
    return 'Price: up to $max';
  }

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
  String get profileEmail => 'Email (optional)';

  @override
  String get profileEmailInvalid =>
      'Enter a valid email, up to 160 characters.';

  @override
  String get profileNameTooLong => 'Use no more than 120 characters.';

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
  String get afterSalesDeliveredOnly =>
      'These services are available after the order is delivered.';

  @override
  String get reviewOrderTitle => 'Review products';

  @override
  String get reviewOrderHint =>
      'Choose an item from this delivered order. Product reviews are separate from delivery ratings.';

  @override
  String get reviewChooseProduct => 'Product to review';

  @override
  String get reviewRating => 'Your rating';

  @override
  String reviewStars(String count) {
    return '$count out of 5 stars';
  }

  @override
  String get reviewComment => 'Comment (optional)';

  @override
  String get reviewSubmit => 'Submit review';

  @override
  String get reviewSubmitted =>
      'Review submitted. Publication is subject to review.';

  @override
  String get reviewAllSubmitted =>
      'You have submitted reviews for all items in this session.';

  @override
  String get returnOrderTitle => 'Request a return';

  @override
  String get returnOrderHint =>
      'Choose quantities to return. Leave items you want to keep at 0.';

  @override
  String returnAvailable(String count) {
    return 'Quantity available to request: $count';
  }

  @override
  String get returnIncrease => 'Increase return quantity';

  @override
  String get returnDecrease => 'Decrease return quantity';

  @override
  String get returnReason => 'Reason for return (optional)';

  @override
  String get returnSubmit => 'Submit return request';

  @override
  String get returnSubmitted => 'Return request submitted.';

  @override
  String returnReference(String id) {
    return 'Request reference: $id';
  }

  @override
  String get returnRequestOnly =>
      'This is a request, not an approval or a refund. The store will review it.';

  @override
  String get returnAllRequested =>
      'All item quantities have been requested for return in this session.';

  @override
  String get routeNotFoundTitle => 'Page not found';

  @override
  String get deliveryAssigned => 'Assigned';

  @override
  String get deliveryOutForDelivery => 'Out for delivery';

  @override
  String get deliveryDelivered => 'Delivered';

  @override
  String get deliveryFailed => 'Delivery failed';

  @override
  String get deliveryReturned => 'Returned';

  @override
  String get deliveryUnknownStatus => 'Unknown status';

  @override
  String get deliveryEmptyTitle => 'No assigned deliveries';

  @override
  String get deliveryEmptyMessage =>
      'Your deliveries will appear here when assigned to you.';

  @override
  String get deliveryNoAccess =>
      'Your account does not have access to assigned deliveries.';

  @override
  String get deliveryOrderId => 'Order reference';

  @override
  String get deliveryFee => 'Delivery fee';

  @override
  String get deliveryDispatchedAt => 'Dispatched';

  @override
  String get deliveryDeliveredAt => 'Delivered';

  @override
  String get deliveryUpdateStatus => 'Update status';

  @override
  String get deliverySelectStatus => 'Choose a status';

  @override
  String get deliveryStatusUpdated => 'Delivery status updated';

  @override
  String get adminProducts => 'Products';

  @override
  String get adminCategories => 'Categories';

  @override
  String get adminRoles => 'Roles';

  @override
  String get adminSuppliers => 'Suppliers';

  @override
  String get adminWarehouses => 'Warehouses';

  @override
  String get adminLocations => 'Storage locations';

  @override
  String get adminAdd => 'Add';

  @override
  String get adminEdit => 'Edit';

  @override
  String get adminDeleteConfirm => 'Delete this record?';

  @override
  String get adminArchiveConfirm => 'Archive this product?';

  @override
  String get adminSaved => 'Saved';

  @override
  String get adminDeleted => 'Deleted';

  @override
  String get adminEmpty => 'No matching records';

  @override
  String get adminFieldName => 'Name';

  @override
  String get adminFieldNameAr => 'Arabic name';

  @override
  String get adminFieldNameEn => 'English name';

  @override
  String get adminFieldPhone => 'Phone';

  @override
  String get adminFieldEmail => 'Email';

  @override
  String get adminFieldAddress => 'Address';

  @override
  String get adminFieldDescription => 'Description';

  @override
  String get adminFieldPrice => 'Sale price';

  @override
  String get adminFieldFloorPrice => 'Negotiation floor price';

  @override
  String get adminFieldPointsPrice => 'Redemption points cost';

  @override
  String get adminFieldIcon => 'Icon name';

  @override
  String get adminFieldSort => 'Display order';

  @override
  String get adminFieldActive => 'Active';

  @override
  String get adminInactive => 'Inactive';

  @override
  String get adminFieldPassword => 'Password (optional)';

  @override
  String get adminFieldParent => 'Parent category';

  @override
  String get adminFieldCategory => 'Category';

  @override
  String get adminFieldRole => 'Role';

  @override
  String get adminFieldStatus => 'Product status';

  @override
  String get adminStatusActive => 'Active';

  @override
  String get adminStatusHidden => 'Hidden';

  @override
  String get adminStatusArchived => 'Archived';

  @override
  String get adminFieldExpiry => 'Track expiry';

  @override
  String get adminFieldNegotiable => 'Negotiable';

  @override
  String get adminImages => 'Image URLs — one per line';

  @override
  String get adminVariants => 'Product variants';

  @override
  String get adminAddVariant => 'Add variant';

  @override
  String get adminSku => 'SKU';

  @override
  String get adminPriceDelta => 'Price difference';

  @override
  String get adminAttributes => 'Attributes';

  @override
  String get adminAttributeName => 'Attribute';

  @override
  String get adminAttributeValue => 'Value';

  @override
  String get adminAddAttribute => 'Add attribute';

  @override
  String get adminPermissions => 'Permissions';

  @override
  String get adminRequired => 'This field is required';

  @override
  String get adminInvalidNumber => 'Enter a valid number';

  @override
  String get adminInvalidEmail => 'Enter a valid email';

  @override
  String get adminInvalidUrl => 'Enter image URLs starting with https or http';

  @override
  String get adminAllRoles => 'All roles';

  @override
  String get adminNoParent => 'No parent category';

  @override
  String get adminSelect => 'Select';

  @override
  String get adminSelected => 'Selected';

  @override
  String get adminSelectedWarehouse => 'Selected warehouse';

  @override
  String get adminSelectedLocation => 'Selected location';

  @override
  String get adminZone => 'Zone';

  @override
  String get adminAisle => 'Aisle';

  @override
  String get adminShelf => 'Shelf';

  @override
  String get adminBin => 'Bin';

  @override
  String get adminNoLocation => 'No location selected';

  @override
  String get adminCatalogHub => 'Manage products and categories';

  @override
  String get adminUsersHub => 'Manage users and roles';

  @override
  String get adminPermissionHint => 'Choose the operations this role may use';

  @override
  String get adminPermissionCatalogView => 'View catalog';

  @override
  String get adminPermissionCatalogManage => 'Manage catalog';

  @override
  String get adminPermissionOrdersView => 'View orders';

  @override
  String get adminPermissionOrdersConfirm => 'Confirm orders';

  @override
  String get adminPermissionOrdersUpdate => 'Update orders';

  @override
  String get adminPermissionInventoryView => 'View inventory';

  @override
  String get adminPermissionInventoryPick => 'Pick orders';

  @override
  String get adminPermissionInventoryAdjust => 'Adjust inventory';

  @override
  String get adminPermissionInventoryTransfer => 'Transfer inventory';

  @override
  String get adminPermissionPurchasingView => 'View purchases and suppliers';

  @override
  String get adminPermissionPurchasingManage =>
      'Manage purchases and suppliers';

  @override
  String get adminPermissionReturnsView => 'View returns';

  @override
  String get adminPermissionReturnsProcess => 'Process returns';

  @override
  String get adminPermissionDeliveryAssigned =>
      'View and update assigned deliveries';

  @override
  String get adminPermissionLoyaltyManage => 'Manage loyalty points';

  @override
  String get adminPermissionUsersManage => 'Manage users and roles';

  @override
  String get adminPermissionReportsView => 'View reports';

  @override
  String get adminPermissionSettingsManage => 'Manage store settings';

  @override
  String get adminOrderConfirm => 'Confirm order';

  @override
  String get adminOrderUpdate => 'Update status';

  @override
  String get adminOrderCurrentStatus => 'Current status';

  @override
  String get adminOrderNewStatus => 'New status';

  @override
  String get adminOrderConfirmMessage => 'Confirm acceptance of this order?';

  @override
  String get adminOrderUpdated => 'Order status updated';

  @override
  String get adminOrderSearch => 'Search by order number or customer';

  @override
  String get adminOrderClearSearch => 'Clear search';

  @override
  String get adminOrderDateRange => 'Date range';

  @override
  String get adminOrderClearDates => 'Clear date filter';

  @override
  String get adminOrderEmptyHint => 'Try another status, search or date range.';

  @override
  String get filterOnSale => 'Offers';

  @override
  String promotionDiscount(String percent) {
    return '$percent% off';
  }

  @override
  String promotionOriginalPrice(String price) {
    return 'Original price: $price';
  }

  @override
  String get promotionBasePrice => 'Base product offer';

  @override
  String get adminOriginalPrice => 'Original price (optional)';

  @override
  String get adminOriginalPriceHint =>
      'Leave empty or set no higher than the sale price to remove the offer.';

  @override
  String bannerPosition(String current, String total) {
    return '$current of $total';
  }

  @override
  String get bannerOpenFailed => 'Could not open this link. Please try again.';

  @override
  String get startupTagline => 'Everything you need, all in one place';

  @override
  String get startupLoading => 'Getting the app ready';

  @override
  String get adminUserSearch => 'Search for a user';

  @override
  String get accountEditProfile => 'Edit profile';

  @override
  String get accountNoName => 'No name added';

  @override
  String get accountNoEmail => 'No email added';

  @override
  String get accountNoPhone => 'Phone number unavailable';

  @override
  String get profilePhone => 'Phone number';

  @override
  String get profileChangePhone => 'Change';

  @override
  String get profilePhoneChangeUnavailable =>
      'Phone changes are not available yet. The new number will need OTP verification.';

  @override
  String get addressContactPhone => 'Contact phone';

  @override
  String get addressUsePrimaryPhone => 'Use my primary number';

  @override
  String get addressUseOtherPhone => 'Use another number';

  @override
  String get addressOtherPhone => 'Other phone number';

  @override
  String get addressPrimaryPhoneBadge => 'Primary';

  @override
  String get addressContactUnavailable => 'Contact phone unavailable';

  @override
  String get addressContactBackendPending =>
      'Saving a contact phone is not available in the service yet.';

  @override
  String get accountSignOutConfirm => 'Do you want to sign out?';

  @override
  String get accountDeleteAcknowledgement =>
      'I confirm that I want to delete my account';

  @override
  String get mainCategoriesTitle => 'Main Categories';

  @override
  String get categoryGroupElectronics => 'Electronics';

  @override
  String get categoryIconElectronicsDevices => 'Devices';

  @override
  String get categoryIconElectronicsCable => 'Cables';

  @override
  String get categoryIconElectronicsRouter => 'Routers';

  @override
  String get categoryIconElectronicsTv => 'Televisions';

  @override
  String get categoryIconElectronicsPower => 'Electrical supplies';

  @override
  String get categoryIconElectronicsBattery => 'Batteries';

  @override
  String get categoryGroupPhones => 'Phones';

  @override
  String get categoryIconMobilePhone => 'Phones';

  @override
  String get categoryIconMobileTablet => 'Tablets';

  @override
  String get categoryIconMobileCharging => 'Chargers';

  @override
  String get categoryIconMobileWatch => 'Smart watches';

  @override
  String get categoryGroupComputers => 'Computers';

  @override
  String get categoryIconComputerLaptop => 'Laptops';

  @override
  String get categoryIconComputerDesktop => 'Desktop computers';

  @override
  String get categoryIconComputerKeyboard => 'Keyboards';

  @override
  String get categoryIconComputerMouse => 'Mice';

  @override
  String get categoryIconComputerPrinter => 'Printers';

  @override
  String get categoryIconComputerStorage => 'Storage';

  @override
  String get categoryGroupAudio => 'Audio';

  @override
  String get categoryIconAudioHeadphones => 'Headphones';

  @override
  String get categoryIconAudioEarbuds => 'Earbuds';

  @override
  String get categoryIconAudioSpeaker => 'Speakers';

  @override
  String get categoryIconAudioMic => 'Microphones';

  @override
  String get categoryIconAudioRadio => 'Radios';

  @override
  String get categoryGroupCameras => 'Cameras';

  @override
  String get categoryIconCameraPhoto => 'Cameras';

  @override
  String get categoryIconCameraVideo => 'Video cameras';

  @override
  String get categoryIconCameraLens => 'Lenses';

  @override
  String get categoryIconCameraSecurity => 'Security cameras';

  @override
  String get categoryGroupGaming => 'Gaming';

  @override
  String get categoryIconGamingConsole => 'Game consoles';

  @override
  String get categoryIconGamingController => 'Controllers';

  @override
  String get categoryGroupFashion => 'Fashion';

  @override
  String get categoryIconFashionClothing => 'Clothing';

  @override
  String get categoryIconFashionMen => 'Menswear';

  @override
  String get categoryIconFashionWomen => 'Womenswear';

  @override
  String get categoryIconFashionShoes => 'Footwear';

  @override
  String get categoryIconFashionUniform => 'Workwear';

  @override
  String get categoryIconFashionLaundry => 'Clothing care';

  @override
  String get categoryGroupAccessories => 'Bags & accessories';

  @override
  String get categoryIconAccessoriesWatch => 'Watches';

  @override
  String get categoryIconAccessoriesBag => 'Bags';

  @override
  String get categoryIconAccessoriesBackpack => 'Backpacks';

  @override
  String get categoryIconAccessoriesLuggage => 'Luggage';

  @override
  String get categoryIconAccessoriesJewelry => 'Jewelry';

  @override
  String get categoryIconAccessoriesUmbrella => 'Umbrellas';

  @override
  String get categoryGroupHome => 'Home & furniture';

  @override
  String get categoryIconHomeFurniture => 'Furniture';

  @override
  String get categoryIconHomeChair => 'Chairs';

  @override
  String get categoryIconHomeBed => 'Beds';

  @override
  String get categoryIconHomeTable => 'Tables';

  @override
  String get categoryIconHomeLighting => 'Lighting';

  @override
  String get categoryIconHomeBath => 'Bathroom';

  @override
  String get categoryIconHomeCurtains => 'Curtains';

  @override
  String get categoryIconHomeBedding => 'Bedding';

  @override
  String get categoryGroupKitchen => 'Kitchen';

  @override
  String get categoryIconKitchenAppliances => 'Appliances';

  @override
  String get categoryIconKitchenCooking => 'Cookware';

  @override
  String get categoryIconKitchenTableware => 'Tableware';

  @override
  String get categoryIconKitchenBlender => 'Blenders';

  @override
  String get categoryIconKitchenMicrowave => 'Microwaves';

  @override
  String get categoryIconKitchenKettle => 'Coffee makers';

  @override
  String get categoryGroupCleaning => 'Cleaning';

  @override
  String get categoryIconCleaningSupplies => 'Cleaning supplies';

  @override
  String get categoryIconCleaningSoap => 'Soap';

  @override
  String get categoryIconCleaningBins => 'Waste bins';

  @override
  String get categoryIconCleaningWater => 'Water care';

  @override
  String get categoryGroupFood => 'Grocery & food';

  @override
  String get categoryIconGroceryFood => 'Groceries';

  @override
  String get categoryIconFoodRice => 'Rice & grains';

  @override
  String get categoryIconFoodBakery => 'Bakery';

  @override
  String get categoryIconFoodFruit => 'Fruit';

  @override
  String get categoryIconFoodVegetables => 'Vegetables';

  @override
  String get categoryIconFoodMeat => 'Meat';

  @override
  String get categoryIconFoodSeafood => 'Seafood';

  @override
  String get categoryIconFoodPizza => 'Pizza';

  @override
  String get categoryIconFoodIcecream => 'Ice cream';

  @override
  String get categoryIconFoodCake => 'Cakes';

  @override
  String get categoryIconFoodEggs => 'Eggs';

  @override
  String get categoryIconFoodSnacks => 'Snacks';

  @override
  String get categoryGroupDrinks => 'Drinks';

  @override
  String get categoryIconDrinksCoffee => 'Coffee';

  @override
  String get categoryIconDrinksTea => 'Tea';

  @override
  String get categoryIconDrinksJuice => 'Juices';

  @override
  String get categoryIconDrinksWater => 'Water';

  @override
  String get categoryGroupBeauty => 'Health & beauty';

  @override
  String get categoryIconBeautySpa => 'Beauty care';

  @override
  String get categoryIconBeautySkin => 'Skin care';

  @override
  String get categoryIconBeautyHair => 'Hair care';

  @override
  String get categoryIconBeautyCosmetics => 'Cosmetics';

  @override
  String get categoryIconBeautyHealth => 'Health supplies';

  @override
  String get categoryIconBeautyHygiene => 'Personal hygiene';

  @override
  String get categoryIconBeautyMedical => 'First aid';

  @override
  String get categoryGroupSport => 'Sports & fitness';

  @override
  String get categoryIconSportFitness => 'Fitness';

  @override
  String get categoryIconSportCycling => 'Cycling';

  @override
  String get categoryIconSportFootball => 'Football';

  @override
  String get categoryIconSportBasketball => 'Basketball';

  @override
  String get categoryIconSportTennis => 'Tennis';

  @override
  String get categoryIconSportSwimming => 'Swimming';

  @override
  String get categoryIconSportCamping => 'Camping';

  @override
  String get categoryIconSportFishing => 'Fishing';

  @override
  String get categoryGroupKids => 'Babies & toys';

  @override
  String get categoryIconKidsBaby => 'Baby care';

  @override
  String get categoryIconKidsStroller => 'Strollers';

  @override
  String get categoryIconKidsToys => 'Toys';

  @override
  String get categoryIconKidsPuzzle => 'Puzzles';

  @override
  String get categoryIconKidsScooter => 'Skates & scooters';

  @override
  String get categoryGroupAuto => 'Auto supplies';

  @override
  String get categoryIconAutoCar => 'Car supplies';

  @override
  String get categoryIconAutoMotorcycle => 'Motorcycles';

  @override
  String get categoryIconAutoTires => 'Tires';

  @override
  String get categoryIconAutoFuel => 'Fuel & oils';

  @override
  String get categoryIconAutoTools => 'Car tools';

  @override
  String get categoryGroupBooks => 'Books & stationery';

  @override
  String get categoryIconBooksReading => 'Books';

  @override
  String get categoryIconBooksNotebooks => 'Notebooks';

  @override
  String get categoryIconBooksPens => 'Pens';

  @override
  String get categoryIconBooksArt => 'Art supplies';

  @override
  String get categoryIconBooksSchool => 'School supplies';

  @override
  String get categoryGroupGarden => 'Pets, garden & tools';

  @override
  String get categoryIconPetsSupplies => 'Pet supplies';

  @override
  String get categoryIconGardenTrees => 'Garden plants';

  @override
  String get categoryIconGardenFlowers => 'Flowers';

  @override
  String get categoryIconGardenTools => 'Hand tools';

  @override
  String get categoryIconGardenBuilding => 'Building supplies';

  @override
  String get categoryIconGardenSolar => 'Solar supplies';

  @override
  String get categoryIconGardenWatering => 'Garden care';

  @override
  String get categoryGroupGifts => 'Gifts & general';

  @override
  String get categoryIconGiftsPresent => 'Gifts';

  @override
  String get categoryIconBeautyFragrance => 'Fragrances';

  @override
  String get categoryIconGiftsParty => 'Party supplies';

  @override
  String get categoryIconGeneralCrafts => 'Craft supplies';

  @override
  String get categoryIconGeneralMusic => 'Musical instruments';

  @override
  String get categoryIconGeneralCategory => 'General products';

  @override
  String get categoryChooseIcon => 'Choose icon';

  @override
  String get categorySearchIcons => 'Search icons';

  @override
  String get categoryAllGroups => 'All groups';

  @override
  String get categoryNoIcons => 'No matching icons';

  @override
  String get categoryDescriptionEn => 'Short description (English)';

  @override
  String get categoryDescriptionAr => 'Short description (Arabic)';

  @override
  String categoryDescriptionLimit(String words, String characters) {
    return 'Required · up to $words words and $characters characters';
  }

  @override
  String get categoryDescriptionInvalid =>
      'Enter a short description within both limits';

  @override
  String get categoryImage => 'Category image';

  @override
  String get mediaImages => 'Product images';

  @override
  String get mediaAdd => 'Add images';

  @override
  String get mediaChoose => 'Choose image';

  @override
  String get mediaReplace => 'Replace';

  @override
  String get mediaRemove => 'Remove';

  @override
  String get mediaEarlier => 'Move earlier';

  @override
  String get mediaLater => 'Move later';

  @override
  String get mediaEmpty => 'No image selected';

  @override
  String get mediaSessionHint =>
      'Selected photos last only for this mock session.';

  @override
  String get mediaRemoteHint => 'Photo upload awaits backend support.';

  @override
  String get mediaPickError =>
      'Could not open or read the selected photos. Try again.';

  @override
  String get categoryVisible => 'Visible to customers';

  @override
  String get adminAddMainCategory => 'Add main category';

  @override
  String get adminAddSubcategory => 'Add subcategory';

  @override
  String get adminBackToCategories => 'Main categories';

  @override
  String get adminChooseCategory =>
      'Choose a main category to manage its subcategories';

  @override
  String adminSubcategoryCount(String count) {
    return '$count subcategories';
  }

  @override
  String adminDisplayOrderValue(String order) {
    return 'Display order: $order';
  }

  @override
  String get adminMainCategoryFilter => 'Main category';

  @override
  String get adminSubcategoryFilter => 'Subcategory';

  @override
  String get adminAllProducts => 'All products';

  @override
  String get adminAllSubcategories => 'Whole category';

  @override
  String adminProductScope(String scope) {
    return 'Scope: $scope';
  }

  @override
  String get adminSearchAllProducts => 'Search all products';

  @override
  String get mediaPrimary => 'Primary image';

  @override
  String get mediaMakePrimary => 'Make primary';

  @override
  String get mediaPrimaryHint =>
      'The first image is primary. Reordering changes the primary image.';

  @override
  String get mediaRemoveConfirm => 'Remove this image?';

  @override
  String get mediaRemoveMessage =>
      'Only this image will be removed from the draft. The category or product will remain.';

  @override
  String get mediaRemovePrimaryMessage =>
      'Remove the primary image from the draft? The product will remain, and the first remaining image (if any) will become primary.';

  @override
  String get mediaProductGuidance =>
      'Square (1:1) works best. Choose a clear original for zooming; the display crops edges without stretching.';

  @override
  String get mediaMainCategoryGuidance =>
      'Use a landscape photo with the subject in the center. The crop ratio changes with the card width.';

  @override
  String get mediaSubcategoryGuidance =>
      'Saved for future use. Current subcategory tiles show the icon, so no photo ratio is required yet.';

  @override
  String get adminViewSubcategories => 'View subcategories';

  @override
  String get adminRetainedProductCategory =>
      'The current category is retained but unavailable for new assignments. Keep it for this product or choose another category to change it.';

  @override
  String get adminDiscountType => 'Discount type';

  @override
  String get adminDiscountNone => 'No discount';

  @override
  String get adminDiscountPercentage => 'Percentage';

  @override
  String get adminDiscountAmount => 'Fixed amount';

  @override
  String get adminDiscountValue => 'Discount value';

  @override
  String get adminDiscountStartsAt => 'Discount starts';

  @override
  String get adminDiscountEndsAt => 'Discount ends';

  @override
  String get adminDiscountDateHint =>
      'Optional; UTC example: 2026-10-01T09:00:00Z';

  @override
  String get adminDiscountDateInvalid =>
      'Enter a valid date and time with timezone, e.g. 2026-10-01T09:00:00Z';

  @override
  String get adminCategorySlug => 'Category URL slug';

  @override
  String get addressInternationalPhoneHint =>
      'Use an international number starting with + and country code; no country code is added automatically.';

  @override
  String get mediaUploadHint =>
      'Images upload when saved. JPEG, PNG, WebP or AVIF, up to 8 MiB per image.';

  @override
  String get orderStatusReadyForDispatch => 'Ready for dispatch';
}
