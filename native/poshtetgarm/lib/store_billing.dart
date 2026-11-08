import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'native_push.dart' show trustedPushOrigin;

/// The store this APK was built for (`flutter build apk --flavor bazaar|myket`); null in the direct build.
final String? buildStore = storeOf(appFlavor);

String? storeOf(String? flavor) =>
    const {'bazaar', 'myket'}.contains(flavor) ? flavor : null;

/// Appended to the WebView user agent so the web app knows, from its first request, to sell through the store.
String storeUserAgent(String? base, String store) =>
    '${(base ?? '').trim()} PoshtetgarmStore/$store'.trim();

/// Payment pages the store builds never open: both stores forbid other payment routes in their builds.
bool blockedInStore(Uri uri) =>
    uri.host == 'zibal.ir' || uri.host.endsWith('.zibal.ir');

const _methods = {'products', 'purchase', 'purchases', 'consume'};

/// Bridges the web billing page to the store's in-app billing (MainActivity's `store` channel). Only the
/// trusted main frame gets the bridge, behind a per-page nonce, like the push bridge.
class StoreBilling {
  static const _channel = MethodChannel('ir.poshtetgarm.hybrid/store');
  WebViewController? _controller;
  String? _nonce;

  bool get enabled => buildStore != null;

  void pageStarted() => _nonce = null;

  Future<void> attach(WebViewController controller, Uri page) async {
    _controller = controller;
    if (!enabled || !trustedPushOrigin(page)) return;
    _nonce = List.generate(
      24,
      (_) => Random.secure().nextInt(256),
    ).map((n) => n.toRadixString(16).padLeft(2, '0')).join();
    await controller.runJavaScript('''
      (() => {
        if (window.top !== window || location.origin !== 'https://poshtetgarm.ir') return;
        const pending = new Map(); let sequence = 0;
        const nonce = ${jsonEncode(_nonce)};
        window.__poshtetgarmStoreReply = (reply) => {
          const task = pending.get(reply.id); if (!task) return;
          pending.delete(reply.id);
          reply.error ? task.reject(new Error(reply.error)) : task.resolve(reply.result);
        };
        window.PoshtetgarmStore = { request(method, args) {
          return new Promise((resolve, reject) => {
            const id = String(++sequence);
            pending.set(id, { resolve, reject });
            StoreBillingChannel.postMessage(JSON.stringify({ id, method, args: args ?? {}, nonce }));
          });
        }};
        window.dispatchEvent(new Event('poshtetgarm-store-ready'));
      })();
    ''');
  }

  Future<void> handle(JavaScriptMessage message) async {
    final controller = _controller;
    final nonce = _nonce;
    if (controller == null || nonce == null) return;
    Map<String, dynamic> request;
    try {
      request = Map<String, dynamic>.from(jsonDecode(message.message) as Map);
    } catch (_) {
      return;
    }
    final method = request['method'];
    if (request['nonce'] != nonce ||
        request['id'] is! String ||
        !_methods.contains(method)) {
      return;
    }
    final page = Uri.tryParse(await controller.currentUrl() ?? '');
    if (page == null || !trustedPushOrigin(page)) return;
    final reply = <String, dynamic>{'id': request['id']};
    try {
      reply['result'] = await _channel.invokeMethod<Object?>(
        method as String,
        request['args'] is Map ? request['args'] : const {},
      );
    } on PlatformException catch (error) {
      // Only the code (unavailable, failed) reaches the page.
      reply['error'] = error.code == 'unavailable' ? 'unavailable' : 'failed';
    } on MissingPluginException {
      reply['error'] = 'unavailable';
    }
    if (_nonce != nonce) return;
    final current = Uri.tryParse(await controller.currentUrl() ?? '');
    if (current == null || !trustedPushOrigin(current)) return;
    await controller.runJavaScript(
      "if (location.origin === 'https://poshtetgarm.ir') window.__poshtetgarmStoreReply?.(${jsonEncode(reply)})",
    );
  }
}
