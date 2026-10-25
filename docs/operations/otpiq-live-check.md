# OTPIQ one-message live check / فحص OTPIQ برسالة واحدة

This operator command sends exactly one verification SMS through the same
`SmsGatewayService` adapter used by customer sign-in, waits for the provider's
final tracking result, and prints only the SMS id, final status, cost, remaining
credit and latency. It does not open the database. Never paste a key into chat,
a ticket, source control or a saved script.

يرسل هذا الأمر التشغيلي رسالة تحقق واحدة فقط من خلال نفس محول
`SmsGatewayService` المستخدم لتسجيل دخول العملاء، ثم ينتظر نتيجة التتبع النهائية.
لا يفتح قاعدة البيانات ولا يطبع المفتاح أو رمز التحقق أو رقم الهاتف.

## PowerShell

Run from `backend/`. The `finally` block removes the key from the current shell
even when the check fails:

```powershell
$env:OTPIQ_API_KEY = '<paste-key-locally>'; try { npm run otp:live-check -- --phone +9647701234567 --requester-ip 203.0.113.10 } finally { Remove-Item Env:OTPIQ_API_KEY }
```

For a key beginning with `sk_live_`, append `--allow-live`. Without that flag
the command refuses before making an HTTP request.

نفّذ الأمر من مجلد `backend/`. أضف `--allow-live` فقط عند استخدام مفتاح يبدأ
بـ `sk_live_` وبعد الموافقة على إرسال الرسالة الحقيقية. يحذف جزء `finally`
المفتاح من جلسة PowerShell حتى عند فشل الفحص.

## Bash

The assignment exists only for this command:

```bash
OTPIQ_API_KEY='<paste-key-locally>' npm run otp:live-check -- --phone +9647701234567 --requester-ip 203.0.113.10
```

Append `--allow-live` for an approved live-key check. Development keys deliver
to the development phone configured in the OTPIQ dashboard, regardless of the
requested number.

يبقى المتغير في أمر Bash هذا فقط. مفاتيح التطوير ترسل إلى رقم التطوير المضبوط
في لوحة OTPIQ بغض النظر عن الرقم المطلوب.

## Dashboard verification / التحقق من لوحة التحكم

After the command, find the printed `smsId` in OTPIQ. Confirm there was exactly
one submission, its channel/final status match the command, and the dashboard's
anti-fraud/IP counter records the `--requester-ip` value. If the IP is absent,
stop activation and change only the isolated `otpiqAntiFraud` helper after
confirming the provider's current field spelling; do not duplicate the payload
shape elsewhere.

بعد التنفيذ، ابحث عن `smsId` المطبوع في لوحة OTPIQ. تأكد من وجود إرسال واحد
فقط، ومن تطابق القناة والحالة النهائية، ومن احتساب عنوان `--requester-ip` ضمن
حماية الاحتيال. إذا لم يظهر العنوان فأوقف التفعيل وراجع تهجئة حقل المزود في
الدالة المعزولة `otpiqAntiFraud` فقط.
