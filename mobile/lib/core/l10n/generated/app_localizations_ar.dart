// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Arabic (`ar`).
class AppLocalizationsAr extends AppLocalizations {
  AppLocalizationsAr([String locale = 'ar']) : super(locale);

  @override
  String get storeFallbackName => 'المتجر';

  @override
  String get actionRetry => 'إعادة المحاولة';

  @override
  String get actionCancel => 'إلغاء';

  @override
  String get actionContinue => 'متابعة';

  @override
  String get actionSave => 'حفظ';

  @override
  String get actionClose => 'إغلاق';

  @override
  String get actionDelete => 'حذف';

  @override
  String get navHome => 'الرئيسية';

  @override
  String get navCategories => 'الأقسام';

  @override
  String get navCart => 'السلة';

  @override
  String get navOrders => 'الطلبات';

  @override
  String get navAccount => 'الحساب';

  @override
  String get stateLoading => 'جارٍ التحميل…';

  @override
  String get stateEmptyTitle => 'لا يوجد شيء هنا بعد';

  @override
  String get stateEmptyMessage => 'سيظهر المحتوى هنا فور توفره.';

  @override
  String get stateErrorTitle => 'حدث خطأ ما';

  @override
  String get errorNetwork =>
      'لا يوجد اتصال بالإنترنت. تحقّق من الشبكة وحاول مرة أخرى.';

  @override
  String get errorTimeout => 'استغرق الطلب وقتًا طويلًا. حاول مرة أخرى.';

  @override
  String get errorServer => 'تعذّر على الخادم إكمال الطلب.';

  @override
  String get errorUnauthorized =>
      'انتهت صلاحية الجلسة. الرجاء تسجيل الدخول مجددًا.';

  @override
  String get errorNotFound => 'لم نتمكّن من العثور على ما تبحث عنه.';

  @override
  String get errorValidation => 'يرجى التحقّق من البيانات المُدخلة.';

  @override
  String get errorRateLimited => 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.';

  @override
  String get errorUnknown => 'حدث خطأ غير متوقّع.';

  @override
  String get authSignInTitle => 'تسجيل الدخول';

  @override
  String get authSignInSubtitle => 'أدخل رقم هاتفك وسنرسل لك رمز تحقّق.';

  @override
  String get authPhoneLabel => 'رقم الهاتف';

  @override
  String get authPhoneHint => '+964 770 000 0000';

  @override
  String get authPhoneInvalid => 'أدخل رقم هاتف صحيح.';

  @override
  String get authSendCode => 'إرسال الرمز';

  @override
  String get authVerifyTitle => 'رمز التحقّق';

  @override
  String authVerifySubtitle(String phone) {
    return 'أرسلنا رمزًا من ٦ أرقام إلى $phone.';
  }

  @override
  String get authCodeLabel => 'رمز التحقّق';

  @override
  String get authCodeInvalid => 'أدخل الرمز المكوّن من ٦ أرقام.';

  @override
  String get authVerify => 'تحقّق';

  @override
  String get authResendCode => 'إعادة إرسال الرمز';

  @override
  String get authSignOut => 'تسجيل الخروج';

  @override
  String get authGuest => 'زائر';

  @override
  String get accountTitle => 'حسابي';

  @override
  String get accountLanguage => 'اللغة';

  @override
  String get accountLanguageArabic => 'العربية';

  @override
  String get accountLanguageEnglish => 'English';

  @override
  String get accountCurrency => 'العملة';

  @override
  String get accountGuestPrompt =>
      'سجّل الدخول للوصول إلى سلّتك وطلباتك ونقاط الولاء.';

  @override
  String get accountPreferences => 'التفضيلات';

  @override
  String get accountSupport => 'المساعدة والدعم';

  @override
  String get accountHelp => 'المساعدة';

  @override
  String get accountPrivacy => 'سياسة الخصوصية';

  @override
  String get accountTheme => 'المظهر';

  @override
  String get accountThemeSystem => 'النظام';

  @override
  String get accountThemeLight => 'فاتح';

  @override
  String get accountThemeDark => 'داكن';

  @override
  String accountSignedInAs(String role) {
    return 'مسجّل الدخول بصفة $role';
  }

  @override
  String get roleCustomer => 'زبون';

  @override
  String get roleDelivery => 'مندوب توصيل';

  @override
  String get roleStaff => 'موظّف';

  @override
  String get homeTitle => 'الرئيسية';

  @override
  String get categoriesTitle => 'الأقسام';

  @override
  String get categoriesBrowseAll => 'تصفّح الكل';

  @override
  String get cartTitle => 'السلة';

  @override
  String get cartEmptyTitle => 'سلتك فارغة';

  @override
  String get cartEmptyMessage => 'أضِف منتجات لتبدأ التسوّق.';

  @override
  String get cartSubtotal => 'المجموع الفرعي';

  @override
  String get cartCheckout => 'متابعة الدفع';

  @override
  String get cartRemove => 'إزالة';

  @override
  String get cartAdded => 'تمت الإضافة إلى السلة';

  @override
  String get cartViewCart => 'عرض السلة';

  @override
  String get cartSignInPrompt => 'سجّل الدخول للإضافة إلى السلة';

  @override
  String get addressesTitle => 'العناوين';

  @override
  String get addressAdd => 'إضافة عنوان';

  @override
  String get addressEdit => 'تعديل العنوان';

  @override
  String get addressEmptyTitle => 'لا عناوين محفوظة';

  @override
  String get addressEmptyMessage => 'أضِف عنوان توصيل لتسريع الدفع.';

  @override
  String get addressLabel => 'الاسم المختصر';

  @override
  String get addressCity => 'المدينة';

  @override
  String get addressArea => 'المنطقة';

  @override
  String get addressStreet => 'الشارع';

  @override
  String get addressDetails => 'تفاصيل إضافية';

  @override
  String get addressCityRequired => 'أدخل المدينة.';

  @override
  String get addressSetDefault => 'تعيين افتراضياً';

  @override
  String get addressDefault => 'افتراضي';

  @override
  String get addressDeleteTitle => 'حذف هذا العنوان؟';

  @override
  String get checkoutTitle => 'الدفع';

  @override
  String get checkoutAddress => 'عنوان التوصيل';

  @override
  String get checkoutChangeAddress => 'تغيير';

  @override
  String get checkoutCoupon => 'كوبون الخصم';

  @override
  String get checkoutCouponHint => 'أدخل الرمز';

  @override
  String get checkoutCouponInvalid => 'رمز الكوبون غير صالح';

  @override
  String get checkoutDiscount => 'الخصم';

  @override
  String get checkoutDelivery => 'رسوم التوصيل';

  @override
  String get checkoutDeliveryNote => 'تُحتسب عند التأكيد';

  @override
  String get checkoutTotal => 'الإجمالي';

  @override
  String get checkoutPayment => 'طريقة الدفع';

  @override
  String get checkoutCod => 'الدفع عند الاستلام';

  @override
  String get checkoutPlaceOrder => 'تأكيد الطلب';

  @override
  String get checkoutSuccessTitle => 'تم تقديم طلبك';

  @override
  String get checkoutSuccessMessage => 'سيتواصل معك المندوب لتأكيد التوصيل.';

  @override
  String get checkoutOrderNumber => 'رقم الطلب';

  @override
  String get checkoutBackHome => 'العودة للتسوّق';

  @override
  String get checkoutViewOrders => 'عرض طلباتي';

  @override
  String get wishlistTitle => 'المفضّلة';

  @override
  String get wishlistEmptyTitle => 'قائمتك فارغة';

  @override
  String get wishlistEmptyMessage => 'احفظ المنتجات التي تعجبك لتجدها هنا.';

  @override
  String get wishlistAdd => 'أضف إلى المفضّلة';

  @override
  String get wishlistRemove => 'إزالة من المفضّلة';

  @override
  String get wishlistSignInPrompt => 'سجّل الدخول للحفظ في المفضّلة';

  @override
  String get ordersTitle => 'الطلبات';

  @override
  String get ordersEmptyTitle => 'لا طلبات بعد';

  @override
  String get ordersEmptyMessage => 'ابدأ التسوّق وستظهر طلباتك هنا.';

  @override
  String get ordersFilterAll => 'الكل';

  @override
  String get ordersFilterEmpty => 'لا طلبات بهذه الحالة';

  @override
  String orderItemsCount(String count) {
    return '$count منتجات';
  }

  @override
  String get orderDetailTitle => 'تفاصيل الطلب';

  @override
  String get orderItemsSection => 'المنتجات';

  @override
  String orderLineQuantity(String count) {
    return 'الكمية: $count';
  }

  @override
  String get orderSummary => 'ملخّص الطلب';

  @override
  String get orderDate => 'تاريخ الطلب';

  @override
  String get orderTrackingTitle => 'تتبّع الطلب';

  @override
  String get orderCancel => 'إلغاء الطلب';

  @override
  String get orderCancelTitle => 'إلغاء هذا الطلب؟';

  @override
  String get orderCancelMessage => 'لا يمكن التراجع بعد الإلغاء.';

  @override
  String get orderKeepOrder => 'تراجع';

  @override
  String get orderCancelledDone => 'تم إلغاء الطلب.';

  @override
  String get orderStatusPending => 'بانتظار القبول';

  @override
  String get orderStatusConfirmed => 'مؤكّد';

  @override
  String get orderStatusProcessing => 'قيد التجهيز';

  @override
  String get orderStatusOutForDelivery => 'قيد التوصيل';

  @override
  String get orderStatusDelivered => 'تم التوصيل';

  @override
  String get orderStatusFailedDelivery => 'تعذّر التوصيل';

  @override
  String get orderStatusCancelled => 'ملغى';

  @override
  String get orderStatusReturnRequested => 'طلب إرجاع';

  @override
  String get orderStatusReturned => 'مُرجَع';

  @override
  String get deliveryTitle => 'التوصيل';

  @override
  String get adminTitle => 'لوحة التحكّم';

  @override
  String get comingSoonTitle => 'قريبًا';

  @override
  String get comingSoonMessage => 'هذا الجزء من التطبيق قيد التطوير.';

  @override
  String get commonOutOfStock => 'غير متوفر';

  @override
  String get homeSectionDepartments => 'تسوّق حسب القسم';

  @override
  String get homeAllDepartments => 'الكل';

  @override
  String get homeSectionProducts => 'منتجات';

  @override
  String get productDescription => 'الوصف';

  @override
  String get productNegotiable => 'قابل للتفاوض';

  @override
  String get productAddToCart => 'أضف إلى السلة';

  @override
  String get productVariants => 'الخيارات';

  @override
  String get productQuantity => 'الكمية';

  @override
  String get productInStock => 'متوفّر';

  @override
  String productLowStock(String count) {
    return 'باقٍ $count';
  }

  @override
  String get productReviews => 'التقييمات';

  @override
  String get productNoReviews => 'لا توجد تقييمات بعد';

  @override
  String productReviewsCount(String count) {
    return '$count تقييم';
  }

  @override
  String get productVerifiedPurchase => 'شراء موثّق';

  @override
  String get productReviewsSoon => 'التقييمات قريبًا.';

  @override
  String get searchHint => 'ابحث عن منتج';

  @override
  String get searchNoResults => 'لا توجد منتجات مطابقة.';

  @override
  String get sortNewest => 'الأحدث';

  @override
  String get sortCheapest => 'الأقل سعرًا';

  @override
  String get sortDearest => 'الأعلى سعرًا';

  @override
  String get sortTopRated => 'الأعلى تقييمًا';

  @override
  String get filtersTitle => 'الفلاتر';

  @override
  String get filterPrice => 'السعر';

  @override
  String get filterMin => 'من';

  @override
  String get filterMax => 'إلى';

  @override
  String get filterApply => 'تطبيق';

  @override
  String get filterClear => 'مسح';

  @override
  String get adminSectionCatalog => 'الكتالوج';

  @override
  String get adminSectionOrders => 'الطلبات';

  @override
  String get adminSectionInventory => 'المخزون';

  @override
  String get adminSectionPicking => 'الانتقاء';

  @override
  String get adminSectionPurchasing => 'المشتريات';

  @override
  String get adminSectionReturns => 'المرتجعات';

  @override
  String get adminSectionReports => 'التقارير';

  @override
  String get adminSectionUsers => 'المستخدمون والأدوار';

  @override
  String get adminSectionSettings => 'الإعدادات';

  @override
  String get adminNoAccess => 'لا توجد صلاحيات مسندة لحسابك.';

  @override
  String get profileTitle => 'الملف الشخصي';

  @override
  String get profileName => 'الاسم';

  @override
  String get profileEmail => 'البريد الإلكتروني (اختياري)';

  @override
  String get profileEmailInvalid =>
      'أدخل بريدًا إلكترونيًا صحيحًا لا يتجاوز 160 حرفًا.';

  @override
  String get profileNameTooLong => 'يجب ألا يتجاوز الاسم 120 حرفًا.';

  @override
  String get profileNameRequired => 'أدخل اسمك.';

  @override
  String get profileChangePhoto => 'تغيير الصورة';

  @override
  String get profileSaved => 'تم حفظ التغييرات.';

  @override
  String get profileDeleteAccount => 'حذف الحساب';

  @override
  String get profileDeleteTitle => 'حذف الحساب؟';

  @override
  String get profileDeleteMessage =>
      'سيتم حذف حسابك وبياناته نهائيًا. لا يمكن التراجع عن هذا الإجراء.';

  @override
  String galleryCounter(String current, String total) {
    return '$current من $total';
  }

  @override
  String get afterSalesDeliveredOnly => 'تتوفر هذه الخدمات بعد استلام الطلب.';

  @override
  String get reviewOrderTitle => 'تقييم المنتجات';

  @override
  String get reviewOrderHint =>
      'اختر منتجًا من هذا الطلب المستلم. تقييم المنتج مستقل عن تقييم التوصيل.';

  @override
  String get reviewChooseProduct => 'المنتج المراد تقييمه';

  @override
  String get reviewRating => 'تقييمك';

  @override
  String reviewStars(String count) {
    return '$count من 5 نجوم';
  }

  @override
  String get reviewComment => 'التعليق (اختياري)';

  @override
  String get reviewSubmit => 'إرسال التقييم';

  @override
  String get reviewSubmitted => 'تم إرسال التقييم. يخضع النشر للمراجعة.';

  @override
  String get reviewAllSubmitted =>
      'أرسلت تقييمات لجميع المنتجات خلال هذه الجلسة.';

  @override
  String get returnOrderTitle => 'طلب إرجاع';

  @override
  String get returnOrderHint =>
      'حدد كميات المنتجات المراد إرجاعها، واترك كمية المنتجات التي تريد الاحتفاظ بها على 0.';

  @override
  String returnAvailable(String count) {
    return 'الكمية المتاحة لطلب الإرجاع: $count';
  }

  @override
  String get returnIncrease => 'زيادة كمية الإرجاع';

  @override
  String get returnDecrease => 'تقليل كمية الإرجاع';

  @override
  String get returnReason => 'سبب الإرجاع (اختياري)';

  @override
  String get returnSubmit => 'إرسال طلب الإرجاع';

  @override
  String get returnSubmitted => 'تم إرسال طلب الإرجاع.';

  @override
  String returnReference(String id) {
    return 'رقم طلب الإرجاع: $id';
  }

  @override
  String get returnRequestOnly =>
      'هذا طلب إرجاع وليس موافقة أو استردادًا للمبلغ. سيراجعه المتجر.';

  @override
  String get returnAllRequested => 'طلبت إرجاع جميع الكميات خلال هذه الجلسة.';

  @override
  String get routeNotFoundTitle => 'الصفحة غير موجودة';

  @override
  String get deliveryAssigned => 'تم الإسناد';

  @override
  String get deliveryOutForDelivery => 'خرج للتوصيل';

  @override
  String get deliveryDelivered => 'تم التسليم';

  @override
  String get deliveryFailed => 'تعذّر التسليم';

  @override
  String get deliveryReturned => 'تم الإرجاع';

  @override
  String get deliveryUnknownStatus => 'حالة غير معروفة';

  @override
  String get deliveryEmptyTitle => 'لا توجد توصيلات مسندة إليك';

  @override
  String get deliveryEmptyMessage => 'ستظهر مهام التوصيل هنا عند إسنادها إليك.';

  @override
  String get deliveryNoAccess =>
      'ليس لدى حسابك صلاحية الوصول إلى التوصيلات المسندة.';

  @override
  String get deliveryOrderId => 'معرّف الطلب';

  @override
  String get deliveryFee => 'رسوم التوصيل';

  @override
  String get deliveryDispatchedAt => 'وقت الإرسال';

  @override
  String get deliveryDeliveredAt => 'وقت التسليم';

  @override
  String get deliveryUpdateStatus => 'تحديث الحالة';

  @override
  String get deliverySelectStatus => 'اختر الحالة';

  @override
  String get deliveryStatusUpdated => 'تم تحديث حالة التوصيل';

  @override
  String get adminProducts => 'المنتجات';

  @override
  String get adminCategories => 'الأصناف';

  @override
  String get adminRoles => 'الأدوار';

  @override
  String get adminSuppliers => 'الموردون';

  @override
  String get adminWarehouses => 'المخازن';

  @override
  String get adminLocations => 'مواقع التخزين';

  @override
  String get adminAdd => 'إضافة';

  @override
  String get adminEdit => 'تعديل';

  @override
  String get adminDeleteConfirm => 'هل تريد حذف هذا السجل؟';

  @override
  String get adminArchiveConfirm => 'هل تريد أرشفة هذا المنتج؟';

  @override
  String get adminSaved => 'تم الحفظ';

  @override
  String get adminDeleted => 'تم الحذف';

  @override
  String get adminEmpty => 'لا توجد سجلات مطابقة';

  @override
  String get adminFieldName => 'الاسم';

  @override
  String get adminFieldNameAr => 'الاسم بالعربية';

  @override
  String get adminFieldNameEn => 'الاسم بالإنجليزية';

  @override
  String get adminFieldPhone => 'رقم الهاتف';

  @override
  String get adminFieldEmail => 'البريد الإلكتروني';

  @override
  String get adminFieldAddress => 'العنوان';

  @override
  String get adminFieldDescription => 'الوصف';

  @override
  String get adminFieldPrice => 'سعر البيع';

  @override
  String get adminFieldFloorPrice => 'أقل سعر قابل للتفاوض';

  @override
  String get adminFieldPointsPrice => 'تكلفة الاستبدال بالنقاط';

  @override
  String get adminFieldIcon => 'رمز الأيقونة';

  @override
  String get adminFieldSort => 'ترتيب العرض';

  @override
  String get adminFieldActive => 'نشط';

  @override
  String get adminInactive => 'غير نشط';

  @override
  String get adminFieldPassword => 'كلمة المرور (اختيارية)';

  @override
  String get adminFieldParent => 'الصنف الأب';

  @override
  String get adminFieldCategory => 'الصنف';

  @override
  String get adminFieldRole => 'الدور';

  @override
  String get adminFieldStatus => 'حالة المنتج';

  @override
  String get adminStatusActive => 'ظاهر';

  @override
  String get adminStatusHidden => 'مخفي';

  @override
  String get adminStatusArchived => 'مؤرشف';

  @override
  String get adminFieldExpiry => 'تتبع انتهاء الصلاحية';

  @override
  String get adminFieldNegotiable => 'قابل للتفاوض';

  @override
  String get adminImages => 'روابط الصور — رابط في كل سطر';

  @override
  String get adminVariants => 'خيارات المنتج';

  @override
  String get adminAddVariant => 'إضافة خيار';

  @override
  String get adminSku => 'رمز SKU';

  @override
  String get adminPriceDelta => 'فرق السعر';

  @override
  String get adminAttributes => 'الخصائص';

  @override
  String get adminAttributeName => 'الخاصية';

  @override
  String get adminAttributeValue => 'القيمة';

  @override
  String get adminAddAttribute => 'إضافة خاصية';

  @override
  String get adminPermissions => 'الصلاحيات';

  @override
  String get adminRequired => 'هذا الحقل مطلوب';

  @override
  String get adminInvalidNumber => 'أدخل رقمًا صحيحًا';

  @override
  String get adminInvalidEmail => 'أدخل بريدًا إلكترونيًا صحيحًا';

  @override
  String get adminInvalidUrl => 'أدخل روابط صور تبدأ بـ https أو http';

  @override
  String get adminAllRoles => 'كل الأدوار';

  @override
  String get adminNoParent => 'بدون صنف أب';

  @override
  String get adminSelect => 'اختيار';

  @override
  String get adminSelected => 'تم الاختيار';

  @override
  String get adminSelectedWarehouse => 'المخزن المختار';

  @override
  String get adminSelectedLocation => 'الموقع المختار';

  @override
  String get adminZone => 'المنطقة';

  @override
  String get adminAisle => 'الممر';

  @override
  String get adminShelf => 'الرف';

  @override
  String get adminBin => 'الخانة';

  @override
  String get adminNoLocation => 'لم يُختر موقع بعد';

  @override
  String get adminCatalogHub => 'إدارة المنتجات والأصناف';

  @override
  String get adminUsersHub => 'إدارة المستخدمين والأدوار';

  @override
  String get adminPermissionHint =>
      'حدد العمليات التي يسمح لهذا الدور باستخدامها';

  @override
  String get adminPermissionCatalogView => 'عرض الكتالوج';

  @override
  String get adminPermissionCatalogManage => 'إدارة الكتالوج';

  @override
  String get adminPermissionOrdersView => 'عرض الطلبات';

  @override
  String get adminPermissionOrdersConfirm => 'قبول الطلبات';

  @override
  String get adminPermissionOrdersUpdate => 'تحديث الطلبات';

  @override
  String get adminPermissionInventoryView => 'عرض المخزون';

  @override
  String get adminPermissionInventoryPick => 'تجهيز الطلبات';

  @override
  String get adminPermissionInventoryAdjust => 'تسوية المخزون';

  @override
  String get adminPermissionInventoryTransfer => 'نقل المخزون';

  @override
  String get adminPermissionPurchasingView => 'عرض المشتريات والموردين';

  @override
  String get adminPermissionPurchasingManage => 'إدارة المشتريات والموردين';

  @override
  String get adminPermissionReturnsView => 'عرض المرتجعات';

  @override
  String get adminPermissionReturnsProcess => 'معالجة المرتجعات';

  @override
  String get adminPermissionDeliveryAssigned =>
      'عرض التوصيلات المسندة وتحديثها';

  @override
  String get adminPermissionLoyaltyManage => 'إدارة نقاط الولاء';

  @override
  String get adminPermissionUsersManage => 'إدارة المستخدمين والأدوار';

  @override
  String get adminPermissionReportsView => 'عرض التقارير';

  @override
  String get adminPermissionSettingsManage => 'إدارة إعدادات المتجر';

  @override
  String get adminOrderConfirm => 'تأكيد الطلب';

  @override
  String get adminOrderUpdate => 'تحديث الحالة';

  @override
  String get adminOrderCurrentStatus => 'الحالة الحالية';

  @override
  String get adminOrderNewStatus => 'الحالة الجديدة';

  @override
  String get adminOrderConfirmMessage => 'هل تريد تأكيد قبول هذا الطلب؟';

  @override
  String get adminOrderUpdated => 'تم تحديث حالة الطلب';

  @override
  String get adminOrderSearch => 'ابحث برقم الطلب أو الزبون';

  @override
  String get adminOrderClearSearch => 'مسح البحث';

  @override
  String get adminOrderDateRange => 'الفترة الزمنية';

  @override
  String get adminOrderClearDates => 'مسح فلتر التاريخ';

  @override
  String get adminOrderEmptyHint => 'جرّب حالة أو بحثًا أو فترة زمنية أخرى.';
}
