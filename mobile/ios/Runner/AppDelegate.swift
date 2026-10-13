import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    guard let registrar = engineBridge.pluginRegistry.registrar(
      forPlugin: "ShubayrNotificationSettings"
    ) else { return }
    let channel = FlutterMethodChannel(
      name: "com.shubayr.app/notification_settings",
      binaryMessenger: registrar.messenger()
    )
    channel.setMethodCallHandler { call, result in
      guard call.method == "open" else {
        result(FlutterMethodNotImplemented)
        return
      }
      let fallback = {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
          result(false)
          return
        }
        UIApplication.shared.open(url, options: [:]) { result($0) }
      }
      let settingsURL: String
      if #available(iOS 16.0, *) {
        settingsURL = UIApplication.openNotificationSettingsURLString
      } else if #available(iOS 15.4, *) {
        settingsURL = UIApplicationOpenNotificationSettingsURLString
      } else {
        fallback()
        return
      }
      guard let url = URL(string: settingsURL) else {
        fallback()
        return
      }
      UIApplication.shared.open(url, options: [:]) { opened in
        if opened { result(true) } else { fallback() }
      }
    }
  }
}
