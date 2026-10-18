import type { StoreInfo } from "@/lib/store-info";

/* ---------------------------------------------------------------------------
 * DRAFT policy texts — privacy, terms of use, returns & refunds — in Arabic
 * and English, for the owner's and a lawyer's review before launch
 * (docs/launch/legal-pages.md).
 *
 * The store's own details — legal name, address, contacts, return window,
 * refund time — come from the public settings (GET /settings, filled in from
 * the Web Admin under Settings → Store info); the display name from the same
 * settings. A detail the owner hasn't entered is left out of its sentence or
 * replaced by a neutral one — never by a placeholder.
 * ------------------------------------------------------------------------- */

export type LegalPageKey = "privacy" | "terms" | "returns";

export interface LegalBlock {
  heading: string;
  paragraphs?: string[];
  items?: string[];
}

export interface LegalDocument {
  title: string;
  intro: string;
  blocks: LegalBlock[];
}

export interface LegalContext {
  storeName: string;
  siteUrl: string;
  info: StoreInfo;
}

type Lang = "ar" | "en";

/** "7 أيام", "14 يومًا", "يوم واحد" — Arabic counts agree with their noun. */
export function arabicDays(count: number): string {
  if (count === 1) return "يوم واحد";
  if (count === 2) return "يومين";
  if (count >= 3 && count <= 10) return `${count} أيام`;
  return `${count} يومًا`;
}

export function englishDays(count: number): string {
  return count === 1 ? "1 day" : `${count} days`;
}

/** The legal name and address that are known, joined; null when neither is. */
function operator(info: StoreInfo, lang: Lang): string | null {
  const name = lang === "en" ? (info.legalName.en ?? info.legalName.ar) : (info.legalName.ar ?? info.legalName.en);
  const address = lang === "en" ? (info.address.en ?? info.address.ar) : (info.address.ar ?? info.address.en);
  const parts = [name, address].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(lang === "ar" ? "، " : ", ") : null;
}

/** The phone and e-mail that are known, as "A or B"; null when none is. */
function contacts(info: StoreInfo, lang: Lang): string | null {
  const parts = [info.phone, info.email].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(lang === "ar" ? " أو " : " or ") : null;
}

function privacyContact(info: StoreInfo): string | null {
  return info.privacyEmail ?? info.email;
}

function privacy(lang: Lang, { storeName, siteUrl, info }: LegalContext): LegalDocument {
  const deleteUrl = `${siteUrl}${lang === "en" ? "/en" : ""}/account/delete`;
  const who = operator(info, lang);
  const privacyEmail = privacyContact(info);
  if (lang === "ar") {
    return {
      title: "سياسة الخصوصية",
      intro: `يدير ${storeName} («نحن») هذا المتجر الإلكتروني وتطبيقاته. توضّح هذه السياسة المعلومات الشخصية التي نجمعها، ولماذا، ومدة الاحتفاظ بها، والخيارات المتاحة لك.`,
      blocks: [
        {
          heading: "من نحن",
          paragraphs: [
            `${who ?? storeName}.`,
            privacyEmail ? `للاستفسارات المتعلقة بالخصوصية: ${privacyEmail}.` : "للاستفسارات المتعلقة بالخصوصية تواصل معنا من صفحة «اتصل بنا».",
          ],
        },
        {
          heading: "ما المعلومات التي نجمعها",
          items: [
            "رقم هاتفك المحمول: لتسجيل دخولك برمز يُرسل إليك، وللاتصال بك لتأكيد طلباتك.",
            "اسمك: على حسابك وطلباتك.",
            "عناوين التوصيل: المحافظة والمدينة والمنطقة والشارع والتفاصيل، والموقع على الخريطة إن أضفته، ورقم هاتف للتواصل.",
            "طلباتك ومرتجعاتك: المنتجات والأسعار والخصومات ورسوم التوصيل وطريقة الدفع (الدفع عند الاستلام) وحالات الطلب.",
            "رموز إشعارات الجهاز: إذا سمحت بالإشعارات في تطبيقنا، يُنشئ نظام Apple أو Google رمزًا لنرسل إليك تحديثات طلباتك.",
            "بيانات تقنية: عنوان IP وسجلات الطلبات الأساسية، للحماية ومنع إساءة الاستخدام.",
          ],
          paragraphs: ["لا نجمع بيانات بطاقات الدفع، فالدفع نقدًا عند الاستلام."],
        },
        {
          heading: "لماذا نستخدمها",
          items: [
            "تنفيذ طلباتك: تأكيدها بالهاتف وتوصيلها واستلام المبلغ.",
            "خدمة العملاء والرد على استفساراتك.",
            "إرسال إشعارات الطلبات والعروض التي اخترت تلقّيها.",
            "حماية المتجر ومنع الاحتيال وإساءة الاستخدام.",
            "الوفاء بالتزاماتنا القانونية والمحاسبية.",
          ],
        },
        {
          heading: "مع من نشاركها",
          items: [
            "فريق التوصيل أو شركاء التوصيل: الاسم والهاتف والعنوان اللازمة لتوصيل طلبك فقط.",
            "مزوّدو الخدمات الذين يستضيفون أنظمتنا أو يرسلون رموز الدخول والإشعارات، لتقديم خدمتهم لنا فقط.",
            "الجهات الرسمية عندما يفرض القانون ذلك.",
          ],
          paragraphs: ["لا نبيع بياناتك أبدًا ولا نستخدمها لإعلانات جهات أخرى."],
        },
        {
          heading: "مدة الاحتفاظ بالبيانات",
          paragraphs: [
            "نحتفظ ببيانات حسابك ما دام حسابك قائمًا.",
            "عند حذف حسابك نحذف اسمك ورقم هاتفك وعناوينك ورموز إشعارات أجهزتك وجلسات الدخول. أما سجلات الطلبات والمرتجعات والمدفوعات والقيود المحاسبية فنحتفظ بها بعد إزالة ما يدل على هويتك، للمدة التي يفرضها القانون لأغراض المحاسبة والضرائب، لأن السجلات المالية المُرحّلة لا يجوز محوها.",
            "نحتفظ بسجلات الحماية لمدة محدودة.",
          ],
        },
        {
          heading: "خياراتك وحقوقك",
          items: [
            "عرض اسمك وعناوينك وتصحيحها من حسابك.",
            "إيقاف الإشعارات من إعدادات حسابك أو جهازك.",
            `حذف حسابك من التطبيق أو من الصفحة ${deleteUrl}.`,
            privacyEmail ? `أي طلب آخر يخص بياناتك: ${privacyEmail}.` : "أي طلب آخر يخص بياناتك: من صفحة «اتصل بنا».",
          ],
        },
        {
          heading: "الأمان",
          paragraphs: ["نحمي بياناتك باتصالات مشفّرة (HTTPS) وبصلاحيات وصول محدودة لموظفينا."],
        },
        {
          heading: "الأطفال",
          paragraphs: ["متجرنا موجّه إلى البالغين، ولا نجمع عن قصد بيانات الأطفال."],
        },
        {
          heading: "التعديلات",
          paragraphs: ["قد نحدّث هذه السياسة، وننشر أي تعديل في هذه الصفحة مع تاريخ التحديث."],
        },
      ],
    };
  }
  return {
    title: "Privacy policy",
    intro: `${storeName} ("we") runs this online store and its apps. This policy explains what personal information we collect, why, how long we keep it, and the choices you have.`,
    blocks: [
      {
        heading: "Who we are",
        paragraphs: [
          `${who ?? storeName}.`,
          privacyEmail ? `For privacy questions: ${privacyEmail}.` : "For privacy questions, reach us through the Contact us page.",
        ],
      },
      {
        heading: "What we collect",
        items: [
          "Your mobile phone number: to sign you in with a one-time code, and to call you to confirm your orders.",
          "Your name: on your account and your orders.",
          "Delivery addresses: governorate, city, area, street, details, the map location if you add one, and a contact phone.",
          "Your orders and returns: products, prices, discounts, delivery fee, payment method (cash on delivery) and status history.",
          "Device notification tokens: if you allow notifications in our app, Apple or Google creates a token so we can send you order updates.",
          "Technical data: IP address and basic request logs, for security and to prevent misuse.",
        ],
        paragraphs: ["We do not collect payment card details: you pay in cash on delivery."],
      },
      {
        heading: "Why we use it",
        items: [
          "To fulfil your orders: confirm them by phone, deliver them and collect payment.",
          "To provide customer support.",
          "To send the order updates and offers you chose to receive.",
          "To protect the store and prevent fraud and misuse.",
          "To meet our legal and accounting obligations.",
        ],
      },
      {
        heading: "Who we share it with",
        items: [
          "Our delivery staff or delivery partners: only the name, phone and address needed to deliver your order.",
          "Service providers who host our systems or send sign-in codes and notifications, only to provide their service to us.",
          "Authorities, where the law requires it.",
        ],
        paragraphs: ["We never sell your data or use it for other companies' advertising."],
      },
      {
        heading: "How long we keep it",
        paragraphs: [
          "We keep your account information for as long as your account is open.",
          "When you delete your account, we delete your name, phone number, addresses, device notification tokens and sign-in sessions. Order, return, payment and accounting records are kept, with anything that identifies you removed, for as long as the law requires for accounting and tax purposes, because posted financial records cannot be erased.",
          "Security logs are kept for a limited time.",
        ],
      },
      {
        heading: "Your choices and rights",
        items: [
          "See and correct your name and addresses in your account.",
          "Turn notifications off in your account or device settings.",
          `Delete your account in the app or at ${deleteUrl}.`,
          privacyEmail ? `Any other request about your data: ${privacyEmail}.` : "Any other request about your data: through the Contact us page.",
        ],
      },
      {
        heading: "Security",
        paragraphs: ["We protect your data with encrypted connections (HTTPS) and limited staff access."],
      },
      {
        heading: "Children",
        paragraphs: ["Our store is meant for adults, and we do not knowingly collect children's data."],
      },
      {
        heading: "Changes",
        paragraphs: ["We may update this policy; any change is published on this page with its date."],
      },
    ],
  };
}

function terms(lang: Lang, { storeName, info }: LegalContext): LegalDocument {
  const who = operator(info, lang);
  if (lang === "ar") {
    return {
      title: "شروط الاستخدام",
      intro: `تسري هذه الشروط عند تصفّح ${storeName} أو الطلب منه. بإتمامك طلبًا فإنك توافق عليها.`,
      blocks: [
        { heading: "المتجر", paragraphs: [who ? `يدير المتجر ${who}.` : `يدير المتجر ${storeName}.`] },
        {
          heading: "حسابك",
          paragraphs: [
            "تسجّل الدخول برقم هاتفك المحمول ورمز يُرسل إليه. حافظ على هاتفك، فأنت مسؤول عن الطلبات التي تتم من حسابك.",
          ],
        },
        {
          heading: "الطلب وتأكيده",
          items: [
            "الطلب الذي تقدّمه عبر المتجر هو طلب شراء، ونؤكّده باتصال هاتفي على الرقم المسجّل في الطلب قبل تجهيزه.",
            "يجوز لنا رفض الطلب أو إلغاؤه، مثلًا عند تعذّر الوصول إليك، أو نفاد الكمية، أو خطأ واضح في السعر، أو الاشتباه بإساءة الاستخدام.",
            "يمكنك إلغاء طلبك ما دامت حالته تسمح بذلك.",
          ],
        },
        {
          heading: "الأسعار والتوفّر",
          items: [
            "الأسعار بالدينار العراقي. السعر المعتمد هو سعر طلبك عند تأكيده.",
            "قد تتغيّر الأسعار والكميات المتوفرة. إذا تغيّر سعر قبل إتمام طلبك نعرض لك السعر الجديد ونطلب موافقتك.",
          ],
        },
        {
          heading: "الخصومات التلقائية والقسائم",
          items: [
            "قد يحصل طلبك على خصم تلقائي حسب قيمة المنتجات، ويظهر في السلة مع ما يلزم للوصول إلى الخصم التالي.",
            "تُطبَّق القسائم حسب شروطها. وتوضّح السلة إن كانت القسيمة تُجمع مع الخصم التلقائي أم يُطبَّق الأفضل لك.",
            "يحسب نظامنا الخصم النهائي عند إتمام الطلب.",
          ],
        },
        {
          heading: "التوصيل",
          items: [
            "نوصل إلى المحافظات التي نخدمها، ورسوم التوصيل تُحدَّد حسب المحافظة وتظهر قبل إتمام الطلب.",
            "مواعيد التوصيل تقديرية. يجب وجود من يستلم الطلب ويدفع المبلغ.",
          ],
        },
        {
          heading: "الدفع",
          paragraphs: [
            "الدفع نقدًا عند الاستلام، والمبلغ هو إجمالي طلبك: قيمة المنتجات ناقص الخصومات زائد رسوم التوصيل. افحص طلبك عند الاستلام.",
          ],
        },
        { heading: "الإرجاع والاسترداد", paragraphs: ["تخضع المرتجعات لسياسة الإرجاع والاسترداد المنشورة في المتجر."] },
        {
          heading: "الاستخدام المقبول",
          paragraphs: ["يُمنع إساءة استخدام المتجر، أو تقديم طلبات وهمية، أو جمع بياناته آليًا، أو محاولة اختراقه."],
        },
        {
          heading: "المسؤولية",
          paragraphs: ["نبذل جهدنا لعرض معلومات دقيقة وتقديم خدمة متواصلة، وفي حدود ما يسمح به القانون لا نتحمل الأضرار غير المباشرة."],
        },
        { heading: "القانون المطبّق", paragraphs: ["تخضع هذه الشروط لقوانين جمهورية العراق."] },
      ],
    };
  }
  return {
    title: "Terms of use",
    intro: `These terms apply when you browse or order from ${storeName}. By placing an order, you agree to them.`,
    blocks: [
      { heading: "The store", paragraphs: [`The store is operated by ${who ?? storeName}.`] },
      {
        heading: "Your account",
        paragraphs: [
          "You sign in with your mobile phone number and a one-time code sent to it. Keep your phone secure: you are responsible for orders placed from your account.",
        ],
      },
      {
        heading: "Orders and confirmation",
        items: [
          "An order placed through the store is a request to buy. We confirm it with a phone call to the number on the order before we prepare it.",
          "We may decline or cancel an order, for example if we cannot reach you, an item is out of stock, a price is clearly wrong, or we suspect misuse.",
          "You can cancel your order while its status allows it.",
        ],
      },
      {
        heading: "Prices and availability",
        items: [
          "Prices are in Iraqi dinars (IQD). The price that applies is the one on your order when it is confirmed.",
          "Prices and stock can change. If a price changes before you place your order, we show you the new price and ask you to accept it.",
        ],
      },
      {
        heading: "Automatic discounts and coupons",
        items: [
          "Your order may get an automatic discount based on the value of the goods; the cart shows it and how far the next discount is.",
          "Coupons apply under their own conditions. The cart shows whether a coupon combines with the automatic discount or the better one applies.",
          "Our system calculates the final discount when you place the order.",
        ],
      },
      {
        heading: "Delivery",
        items: [
          "We deliver to the governorates we serve. The delivery fee depends on the governorate and is shown before you place the order.",
          "Delivery times are estimates. Someone must be available to receive the order and pay.",
        ],
      },
      {
        heading: "Payment",
        paragraphs: [
          "You pay in cash on delivery. The amount is your order total: the goods, minus discounts, plus the delivery fee. Please check your order when it arrives.",
        ],
      },
      { heading: "Returns and refunds", paragraphs: ["Returns follow the returns & refunds policy published in the store."] },
      {
        heading: "Acceptable use",
        paragraphs: ["Do not misuse the store, place fake orders, scrape it automatically or attempt to break into it."],
      },
      {
        heading: "Liability",
        paragraphs: [
          "We do our best to show accurate information and keep the service available. To the extent the law allows, we are not liable for indirect losses.",
        ],
      },
      { heading: "Governing law", paragraphs: ["These terms are governed by the laws of the Republic of Iraq."] },
    ],
  };
}

function returns(lang: Lang, { info }: LegalContext): LegalDocument {
  const window = info.returnWindowDays;
  const refund = info.refundDays;
  const reach = contacts(info, lang);
  if (lang === "ar") {
    const ask =
      window !== null
        ? `يمكنك طلب إرجاع منتج خلال ${arabicDays(window)} من استلامه، من حسابك (طلباتي ← طلب إرجاع) أو بالتواصل معنا.`
        : "يمكنك طلب إرجاع منتج خلال مدة الإرجاع التي يحددها المتجر، من حسابك (طلباتي ← طلب إرجاع) أو بالتواصل معنا. يُظهر لك نموذج الإرجاع إن كان الطلب لا يزال ضمنها.";
    const paid =
      refund === null
        ? "بعد قبول المنتج المُرجَع نعيد قيمته نقدًا."
        : refund === 0
          ? "بعد قبول المنتج المُرجَع نعيد قيمته نقدًا في اليوم نفسه."
          : `بعد قبول المنتج المُرجَع نعيد قيمته خلال ${arabicDays(refund)} نقدًا.`;
    return {
      title: "سياسة الإرجاع والاسترداد",
      intro: "نريد أن تكون راضيًا عن طلبك. إليك كيف تُرجع منتجًا وتسترد مبلغه.",
      blocks: [
        { heading: "طلب الإرجاع", paragraphs: [ask] },
        {
          heading: "شروط المنتج المُرجَع",
          items: [
            "أن يكون غير مستخدم، في عبوته الأصلية، ومعه جميع ملحقاته.",
            "لا يمكن إرجاع بعض المنتجات لأسباب صحية أو تتعلق بالسلامة (مثل منتجات العناية الشخصية المفتوحة والمواد الغذائية) إلا إذا كانت معيبة.",
          ],
        },
        {
          heading: "المنتج المعيب أو الخاطئ",
          paragraphs: ["إذا وصلك منتج معيب أو غير الذي طلبته فأخبرنا خلال مدة الإرجاع، ونستبدله أو نعيد مبلغه كاملًا مع رسوم التوصيل."],
        },
        {
          heading: "كيف تتم العملية",
          items: [
            "نراجع طلب الإرجاع ونخبرك بالنتيجة.",
            "نستلم المنتج من عنوانك أو تسلّمه إلينا حسب ما نتفق عليه.",
            "نفحص المنتج عند استلامه.",
          ],
        },
        {
          heading: "الاسترداد",
          paragraphs: [
            `${paid} تُعاد رسوم التوصيل فقط إذا كان المنتج معيبًا أو كان الخطأ منّا.`,
            "عند إرجاع جزء من الطلب يُحسب المبلغ المسترد لكل منتج بعد توزيع خصومات الطلب عليه.",
          ],
        },
        {
          heading: "التواصل",
          paragraphs: [reach ? `للمساعدة في الإرجاع: ${reach}.` : "للمساعدة في الإرجاع تواصل معنا من صفحة «اتصل بنا»."],
        },
      ],
    };
  }
  const ask =
    window !== null
      ? `You can ask to return a product within ${englishDays(window)} of receiving it, from your account (My orders → Request a return) or by contacting us.`
      : "You can ask to return a product within the return period the store sets, from your account (My orders → Request a return) or by contacting us. The return form shows whether your order is still within it.";
  const paid =
    refund === null
      ? "Once the returned product is accepted, we refund it in cash."
      : refund === 0
        ? "Once the returned product is accepted, we refund it in cash the same day."
        : `Once the returned product is accepted, we refund it within ${englishDays(refund)}, in cash.`;
  return {
    title: "Returns & refunds",
    intro: "We want you to be happy with your order. Here is how to return a product and get your money back.",
    blocks: [
      { heading: "Asking for a return", paragraphs: [ask] },
      {
        heading: "Condition of returned products",
        items: [
          "Unused, in its original packaging, with all its accessories.",
          "Some products cannot be returned for hygiene or safety reasons (such as opened personal care products and food) unless they are faulty.",
        ],
      },
      {
        heading: "Faulty or wrong products",
        paragraphs: ["If a product arrives faulty or is not what you ordered, tell us within the return period: we replace it or refund it in full, delivery fee included."],
      },
      {
        heading: "How it works",
        items: [
          "We review your return request and let you know.",
          "We collect the product from your address, or you hand it to us, as agreed.",
          "We inspect the product when we receive it.",
        ],
      },
      {
        heading: "Refunds",
        paragraphs: [
          `${paid} The delivery fee is refunded only if the product was faulty or the mistake was ours.`,
          "When part of an order is returned, each product's refund is its price after the order's discounts are shared across it.",
        ],
      },
      {
        heading: "Contact",
        paragraphs: [reach ? `For help with a return: ${reach}.` : "For help with a return, reach us through the Contact us page."],
      },
    ],
  };
}

export function legalDocument(page: LegalPageKey, lang: Lang, context: LegalContext): LegalDocument {
  switch (page) {
    case "privacy":
      return privacy(lang, context);
    case "terms":
      return terms(lang, context);
    default:
      return returns(lang, context);
  }
}
