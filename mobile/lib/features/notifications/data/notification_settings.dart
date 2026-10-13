import 'package:flutter/services.dart';

/// Opens OS settings only. The lifecycle reads permission again on resume.
class NotificationSettingsOpener {
  static const _channel = MethodChannel(
    'com.shubayr.app/notification_settings',
  );

  Future<bool> open() async =>
      await _channel.invokeMethod<bool>('open') ?? false;
}
