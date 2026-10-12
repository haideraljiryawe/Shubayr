# Production push notifications with FCM HTTP v1

Shubayr uses Firebase Cloud Messaging HTTP v1 for Android and for iOS devices
registered with Firebase (FCM forwards iOS delivery through the Firebase
project's APNs configuration). The existing `POST /devices/token` and
`DELETE /devices/token` API is unchanged.

## Firebase setup

1. Create or select the production Firebase project.
2. Register the Android and iOS apps in that project. Upload the APNs key or
   certificate under the iOS Cloud Messaging settings.
3. Create a dedicated Google service account with only the Firebase Cloud
   Messaging send permission needed by this API.
4. Download its JSON key once, base64-encode the complete JSON document, store
   it in the deployment secret manager, and remove the downloaded file.

Never commit a service-account JSON file, private key, base64 secret, or a
rendered deployment manifest containing it.

## API environment

Set these values on the API process:

```dotenv
APP_ENV=production
NOTIFICATION_PROVIDER=fcm
FCM_PROJECT_ID=your-firebase-project-id
FCM_SERVICE_ACCOUNT_JSON_BASE64=<secret-manager-reference>
```

`FCM_PROJECT_ID` must match `project_id` inside the service-account JSON. The
API exchanges a signed service-account JWT for the
`firebase.messaging` OAuth scope and caches the short-lived access token. It
then sends notifications through
`https://fcm.googleapis.com/v1/projects/{project}/messages:send`.

Keep `NOTIFICATION_PROVIDER=dev` for local development and CI. It logs push
attempts without network delivery. `NOTIFICATION_PROVIDER=disabled` records
failed delivery attempts and makes no gateway call. Production accepts only
`fcm` or `disabled`; it never falls back to the development sender.

When FCM reports `UNREGISTERED` or token-level `INVALID_ARGUMENT`, the API marks
that device token inactive immediately. A later `POST /devices/token` from the
device can reactivate or replace it.
