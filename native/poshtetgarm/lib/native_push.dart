import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:path_provider/path_provider.dart';
import 'package:webview_flutter/webview_flutter.dart';

// Public Firebase app configuration only. A service-account key NEVER belongs here.
const _firebaseConfig = String.fromEnvironment('FIREBASE_OPTIONS');

bool trustedPushOrigin(Uri uri) =>
    uri.scheme == 'https' && uri.host == 'poshtetgarm.ir' && uri.port == 443;

Uri? notificationDestination(String? value) {
  if (value == null || !value.startsWith('/app/') || value.startsWith('//')) {
    return null;
  }
  final uri = Uri.parse('https://poshtetgarm.ir').resolve(value);
  return trustedPushOrigin(uri) && uri.path.startsWith('/app/') ? uri : null;
}

class NativePush {
  NativePush({required this.navigate});
  final Future<void> Function(Uri url) navigate;
  final _local = FlutterLocalNotificationsPlugin();
  final _subscriptions = <StreamSubscription<dynamic>>[];
  WebViewController? _controller;
  String? _nonce;
  bool _enabled = false;
  String? _token;
  Future<void>? _initializing;
  Uri? _pendingDestination;
  bool get configured => _firebaseConfig.isNotEmpty;

  Future<File> get _preferences async {
    final dir = await getApplicationSupportDirectory();
    return File('${dir.path}/native-push.json');
  }

  Future<void> _save(bool value) async {
    final file = await _preferences;
    await file.parent.create(recursive: true);
    await file.writeAsString(jsonEncode({'enabled': value}), flush: true);
    _enabled = value;
  }

  Future<void> initialize() => _initializing ??= _initialize();
  Future<void> _initialize() async {
    if (!configured) return;
    try {
      final data = jsonDecode(await (await _preferences).readAsString());
      _enabled = data['enabled'] == true;
    } on FileSystemException {
      /* Default: opt out. */
    } on FormatException {
      /* Invalid preference: opt out. */
    }
    final config = Map<String, dynamic>.from(
      jsonDecode(_firebaseConfig) as Map,
    );
    final options = FirebaseOptions(
      apiKey: config['apiKey'] as String,
      appId: config['appId'] as String,
      messagingSenderId: config['messagingSenderId'] as String,
      projectId: config['projectId'] as String,
      iosBundleId: config['iosBundleId'] as String?,
    );
    await Firebase.initializeApp(options: options);
    await FirebaseMessaging.instance.setAutoInitEnabled(_enabled);
    await _local.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('ic_stat_notification'),
        macOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
      onDidReceiveNotificationResponse: (response) => _open(response.payload),
    );
    await _local
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.createNotificationChannel(
          const AndroidNotificationChannel(
            'reminders',
            'یادآوری‌ها',
            description: 'یادآوری تسک‌ها، عادت‌ها و مرور زبان',
            importance: Importance.high,
          ),
        );
    // Android foreground messages need a local OS notification; macOS uses APNs presentation.
    await FirebaseMessaging.instance
        .setForegroundNotificationPresentationOptions(
          alert: true,
          badge: false,
          sound: true,
        );
    _subscriptions.add(
      FirebaseMessaging.onMessage.listen((message) {
        if (!_enabled || !Platform.isAndroid) return;
        unawaited(
          _local.show(
            id:
                (message.data['tag'] ?? message.messageId ?? 'reminder')
                    .hashCode &
                0x7fffffff,
            title: message.notification?.title ?? 'پشتت گرم',
            body: message.notification?.body,
            notificationDetails: const NotificationDetails(
              android: AndroidNotificationDetails(
                'reminders',
                'یادآوری‌ها',
                importance: Importance.high,
                priority: Priority.high,
                icon: 'ic_stat_notification',
              ),
            ),
            payload: message.data['url'],
          ),
        );
      }),
    );
    _subscriptions.add(
      FirebaseMessaging.onMessageOpenedApp.listen(
        (message) => _open(message.data['url']),
      ),
    );
    _subscriptions.add(
      FirebaseMessaging.instance.onRegistered.listen((token) {
        final changed = token != _token;
        _token = token;
        if (_enabled && changed) unawaited(refresh());
      }),
    );
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) _open(initial.data['url']);
    final launch = await _local.getNotificationAppLaunchDetails();
    if (launch?.didNotificationLaunchApp == true) {
      _open(launch?.notificationResponse?.payload);
    }
  }

  void _open(String? path) {
    final uri = notificationDestination(path);
    if (uri == null) return;
    if (_controller == null) {
      _pendingDestination = uri;
    } else {
      unawaited(navigate(uri));
    }
  }

  void pageStarted() {
    _nonce = null;
  }

  Future<void> attach(WebViewController controller, Uri page) async {
    _controller = controller;
    if (!trustedPushOrigin(page) ||
        (!Platform.isAndroid && !Platform.isMacOS)) {
      return;
    }
    _nonce = List.generate(
      24,
      (_) => Random.secure().nextInt(256),
    ).map((n) => n.toRadixString(16).padLeft(2, '0')).join();
    // The channel itself exists in frames too. A nonce kept in the main-frame
    // closure prevents an untrusted iframe from using the permission/token bridge.
    await controller.runJavaScript('''
      (() => {
        if (window.top !== window || location.origin !== 'https://poshtetgarm.ir') return;
        const pending = new Map(); let sequence = 0;
        const nonce = ${jsonEncode(_nonce)};
        window.__poshtetgarmPushReply = (reply) => {
          const task = pending.get(reply.id); if (!task) return;
          pending.delete(reply.id); clearTimeout(task.timer);
          reply.error ? task.reject(new Error(reply.error)) : task.resolve(reply.result);
        };
        window.PoshtetgarmNative = { request(method) {
          return new Promise((resolve, reject) => {
            const id = String(++sequence);
            const timer = setTimeout(() => { pending.delete(id); reject(new Error('ارتباط با اعلان‌های اپ برقرار نشد.')); }, 90000);
            pending.set(id, { resolve, reject, timer });
            NativePushChannel.postMessage(JSON.stringify({ id, method, nonce }));
          });
        }};
        window.dispatchEvent(new Event('poshtetgarm-native-ready'));
      })();
    ''');
    final destination = _pendingDestination;
    _pendingDestination = null;
    if (destination != null) await navigate(destination);
  }

  Future<void> handle(JavaScriptMessage message) async {
    final controller = _controller;
    if (controller == null || _nonce == null) return;
    final nonce = _nonce;
    Map<String, dynamic> request;
    try {
      request = Map<String, dynamic>.from(jsonDecode(message.message) as Map);
    } catch (_) {
      return;
    }
    if (request['nonce'] != nonce || request['id'] is! String) return;
    final page = Uri.tryParse(await controller.currentUrl() ?? '');
    if (page == null || !trustedPushOrigin(page)) return;
    final reply = <String, dynamic>{'id': request['id']};
    try {
      await initialize();
      if (request['method'] == 'disable') {
        await disable();
      } else if (request['method'] == 'enable') {
        if (!configured) {
          throw StateError('تنظیمات اعلان در این نسخهٔ اپ موجود نیست.');
        }
        final settings = await FirebaseMessaging.instance.requestPermission();
        if (settings.authorizationStatus != AuthorizationStatus.authorized) {
          throw StateError(
            'اجازهٔ اعلان بسته است؛ آن را در تنظیمات دستگاه فعال کن.',
          );
        }
        await FirebaseMessaging.instance.setAutoInitEnabled(true);
        await _save(true);
      } else if (request['method'] != 'status') {
        return;
      }
      String? token;
      if (_enabled && configured) {
        final permission = await FirebaseMessaging.instance
            .getNotificationSettings();
        if (permission.authorizationStatus == AuthorizationStatus.authorized) {
          if (Platform.isMacOS) {
            var apns = await FirebaseMessaging.instance.getAPNSToken();
            for (var attempt = 0; apns == null && attempt < 20; attempt++) {
              await Future<void>.delayed(const Duration(milliseconds: 500));
              apns = await FirebaseMessaging.instance.getAPNSToken();
            }
            if (apns == null) {
              throw StateError(
                'اتصال اعلان مک آماده نیست؛ نسخهٔ دارای امضای معتبر را نصب کن.',
              );
            }
          }
          token = _token;
          if (token == null) {
            final registered = FirebaseMessaging.instance.onRegistered.first
                .timeout(const Duration(seconds: 20));
            await FirebaseMessaging.instance.register();
            token = await registered;
            _token = token;
          }
        }
      }
      reply['result'] = {
        'enabled': _enabled && token != null,
        'token': token,
        'platform': Platform.isAndroid ? 'ANDROID' : 'MACOS',
      };
    } catch (error) {
      // No provider errors, credentials or registration tokens enter UI error text.
      if (request['method'] == 'enable') {
        try {
          await disable();
        } catch (_) {
          /* Keep the failed opt-in off. */
        }
      }
      reply['error'] = pushErrorMessage(error);
    }
    if (_nonce != nonce) return;
    final current = Uri.tryParse(await controller.currentUrl() ?? '');
    if (current == null || !trustedPushOrigin(current)) return;
    await controller.runJavaScript(
      "if (location.origin === 'https://poshtetgarm.ir') window.__poshtetgarmPushReply?.(${jsonEncode(reply)})",
    );
  }

  Future<void> disable() async {
    await _save(false);
    if (configured && Firebase.apps.isNotEmpty) {
      await FirebaseMessaging.instance.setAutoInitEnabled(false);
      await FirebaseMessaging.instance.unregister();
      _token = null;
      await _local.cancelAll();
    }
  }

  Future<void> refresh() async {
    final controller = _controller;
    if (controller == null || _nonce == null) return;
    final page = Uri.tryParse(await controller.currentUrl() ?? '');
    if (page != null && trustedPushOrigin(page)) {
      await controller.runJavaScript(
        "window.dispatchEvent(new Event('poshtetgarm-push-token'))",
      );
    }
  }

  Future<void> dispose() async {
    for (final subscription in _subscriptions) {
      await subscription.cancel();
    }
  }
}

/// A user-facing reason for a failed opt-in. Only error codes are shown:
/// never provider messages, credentials or tokens.
String pushErrorMessage(Object error) {
  if (error is StateError) return error.message;
  if (error is TimeoutException) {
    return 'سرور اعلان گوگل (Firebase) جواب نداد. اینترنت یا فیلترشکن را بررسی کن و دوباره تلاش کن. (timeout)';
  }
  if (error is FirebaseException) {
    final code = error.code.toUpperCase();
    if (code.contains('SERVICE_NOT_AVAILABLE') ||
        code.contains('UNAVAILABLE') ||
        code.contains('IO_ERROR')) {
      return 'به سرویس اعلان گوگل وصل نشدیم؛ شاید دسترسی به Google از این شبکه بسته باشد. با فیلترشکن دوباره امتحان کن. (${error.code})';
    }
    if (code.contains('MISSING_INSTANCEID_SERVICE') ||
        code.contains('PLAY')) {
      return 'سرویس‌های Google Play روی این دستگاه در دسترس نیست. (${error.code})';
    }
    return 'اتصال اعلان‌های اپ برقرار نشد. (${error.code})';
  }
  return 'اتصال اعلان‌های اپ برقرار نشد. دوباره تلاش کن. (${error.runtimeType})';
}
