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
  String get routeNotFoundTitle => 'الصفحة غير موجودة';
}
