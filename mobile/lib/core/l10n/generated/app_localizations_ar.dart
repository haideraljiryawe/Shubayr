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
  String get cartTitle => 'السلة';

  @override
  String get ordersTitle => 'الطلبات';

  @override
  String get deliveryTitle => 'التوصيل';

  @override
  String get adminTitle => 'لوحة التحكّم';

  @override
  String get comingSoonTitle => 'قريبًا';

  @override
  String get comingSoonMessage => 'هذا الجزء من التطبيق قيد التطوير.';

  @override
  String get routeNotFoundTitle => 'الصفحة غير موجودة';
}
