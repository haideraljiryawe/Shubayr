# OTPIQ live check / فحص OTPIQ المباشر

## English

The operator command has two modes:

- Send mode submits exactly one verification SMS through the same
  `SmsGatewayService` adapter used by customer sign-in, waits for final
  tracking, and prints only safe delivery metadata.
- `--track <smsId>` polls an existing message once. It sends no SMS and creates
  no charge. It prints status, finality, last channel, a channel-flow summary,
  and whether OTPIQ's tracked phone matched the requested phone. It never prints
  either phone number.

Neither mode opens the database. Never paste a key into chat, a ticket, source
control, or a saved script.

### Secure PowerShell entry

Use a secure prompt so the key does not enter PSReadLine history. From the
directory containing the production Compose file:

```powershell
$secureKey = Read-Host "OTPIQ API key" -AsSecureString
$credential = [System.Net.NetworkCredential]::new('', $secureKey)
$env:OTPIQ_API_KEY = $credential.Password
try {
  docker compose exec -e OTPIQ_API_KEY api npm run otp:live-check -- --phone +9647701234567 --requester-ip 203.0.113.10
} finally {
  Remove-Item Env:OTPIQ_API_KEY -ErrorAction SilentlyContinue
  $credential = $null
  $secureKey.Dispose()
}
```

For a key beginning with `sk_live_`, send mode also requires `--allow-live`.
Without that flag the command refuses before any HTTP request. A successful
development-key check prints:

```text
note: dev key — delivered to the dashboard dev phone
```

OTPIQ development keys redirect delivery to the development phone configured
in the dashboard, so that phone is allowed to differ from `--phone`. The
tracked `smsId` must still match.

The command reports only the anti-fraud field shape—`antiFraud.requesterIp` or
`omitted`—never the IP value. On failure it prints a fixed stage/rule reason,
the provider HTTP status when available, and the `smsId` if submission had
succeeded. It never prints the API key, verification code, requested/tracked
phone, provider exception, or raw response body.

To inspect an already submitted message without sending another SMS, use the
same secure setup and replace the command inside `try` with:

```powershell
docker compose exec -e OTPIQ_API_KEY api npm run otp:live-check -- --phone +9647701234567 --track sms-0123456789abcdef01234567
```

Tracking mode does not need `--allow-live` because it cannot submit a message.
Use the same requested phone that was used for the original submission; the
output reveals only whether it matched.

### Dashboard verification

After send mode, find the printed `smsId` in OTPIQ. Confirm there was exactly
one submission, its channel/final status match the command, and the dashboard's
anti-fraud counter records the supplied requester IP. If it is absent, stop
activation and verify the provider's current field spelling before changing
the isolated `otpiqAntiFraud` helper. Do not duplicate the payload elsewhere.

## العربية

للأمر التشغيلي وضعان:

- وضع الإرسال: يرسل رسالة تحقق واحدة فقط عبر نفس محول
  `SmsGatewayService` المستخدم لتسجيل دخول العملاء، وينتظر نتيجة التتبع
  النهائية، ثم يطبع بيانات آمنة فقط.
- الخيار `--track <smsId>` يستعلم مرة واحدة عن رسالة موجودة. لا يرسل رسالة
  ولا يسبب كلفة جديدة. يطبع الحالة، وهل هي نهائية، وآخر قناة، وملخص انتقال
  القنوات، وهل طابق رقم التتبع الرقم المطلوب، من دون طباعة أي رقم هاتف.

لا يفتح أي من الوضعين قاعدة البيانات. لا تلصق المفتاح في المحادثات أو
التذاكر أو الشيفرة المصدرية أو ملف محفوظ.

### إدخال آمن في PowerShell

استخدم مطالبة آمنة حتى لا يدخل المفتاح في سجل PSReadLine. نفّذ من المجلد
الذي يحتوي ملف Compose الإنتاجي:

```powershell
$secureKey = Read-Host "OTPIQ API key" -AsSecureString
$credential = [System.Net.NetworkCredential]::new('', $secureKey)
$env:OTPIQ_API_KEY = $credential.Password
try {
  docker compose exec -e OTPIQ_API_KEY api npm run otp:live-check -- --phone +9647701234567 --requester-ip 203.0.113.10
} finally {
  Remove-Item Env:OTPIQ_API_KEY -ErrorAction SilentlyContinue
  $credential = $null
  $secureKey.Dispose()
}
```

عند استخدام مفتاح يبدأ بـ `sk_live_` يحتاج وضع الإرسال أيضاً إلى
`--allow-live`، وإلا يتوقف الأمر قبل أي طلب HTTP. عند نجاح مفتاح التطوير يظهر:

```text
note: dev key — delivered to the dashboard dev phone
```

تعيد مفاتيح التطوير توجيه الرسالة إلى رقم التطوير المضبوط في لوحة OTPIQ،
لذلك يُسمح بأن يختلف عن `--phone`، لكن يجب أن يبقى `smsId` مطابقاً.

يطبع الأمر اسم شكل حقل مكافحة الاحتيال فقط، إما
`antiFraud.requesterIp` أو `omitted`، ولا يطبع عنوان IP. وعند الفشل يطبع سبباً
ثابتاً يحدد المرحلة والقاعدة، وحالة HTTP إن توفرت، و`smsId` إذا نجح الإرسال
الأولي. لا يطبع المفتاح أو رمز التحقق أو رقم الهاتف المطلوب أو المتتبع أو
استثناء المزود أو جسم الاستجابة الخام.

لفحص رسالة أُرسلت سابقاً من دون إرسال رسالة جديدة، استخدم الإعداد الآمن نفسه
واستبدل الأمر داخل `try` بما يلي:

```powershell
docker compose exec -e OTPIQ_API_KEY api npm run otp:live-check -- --phone +9647701234567 --track sms-0123456789abcdef01234567
```

لا يحتاج وضع التتبع إلى `--allow-live` لأنه لا يستطيع إرسال رسالة. استخدم
الرقم المطلوب نفسه الذي استُخدم في الإرسال الأصلي؛ يوضح الناتج التطابق فقط.

### التحقق من لوحة التحكم

بعد وضع الإرسال، ابحث عن `smsId` المطبوع في لوحة OTPIQ. تأكد من وجود عملية
إرسال واحدة فقط، ومن تطابق القناة والحالة النهائية، ومن تسجيل عداد مكافحة
الاحتيال لعنوان الطلب. إذا لم يظهر، أوقف التفعيل وتحقق من تهجئة الحقل الحالية
لدى المزود قبل تعديل الدالة المعزولة `otpiqAntiFraud`، ولا تكرر شكل الحمولة
في مكان آخر.
