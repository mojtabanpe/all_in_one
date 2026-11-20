import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

import 'app_settings.dart';
import 'store_billing.dart';

/// Sends errors of the native shell itself (Dart exceptions, a page that does not load) to the api's
/// `POST /api/monitor/errors`, which forwards them to GlitchTip (directive 184). The web app inside the
/// WebView reports its own errors. Only the message, stack, page path, shell version, build and
/// connectivity guess are sent: never a query string, cookie or account content.
class ErrorReport {
  ErrorReport({Uri? endpoint, this.post = _post})
    : endpoint =
          endpoint ?? Uri.parse(productionUrl).resolve('/api/monitor/errors');

  final Uri endpoint;
  final Future<bool> Function(Uri endpoint, String body) post;

  /// Errors not sent yet (offline, server down); retried on the next report or [flush].
  final List<Map<String, Object?>> _queue = [];
  final Set<String> _seen = {};
  bool _sending = false;

  static const maxPerRun = 10;
  static const _maxQueue = 10;

  /// Reports one error. Repeats of the same message and path in this run are dropped.
  void report(
    Object error,
    StackTrace? stack, {
    String path = '/app/',
    bool online = true,
  }) {
    final entry = nativeError(error, stack, path: path, online: online);
    final key = '${entry['message']}|${entry['path']}';
    if (_seen.length >= maxPerRun || !_seen.add(key)) return;
    _queue.add(entry);
    if (_queue.length > _maxQueue) _queue.removeAt(0);
    unawaited(flush());
  }

  Future<void> flush() async {
    if (_sending || _queue.isEmpty) return;
    _sending = true;
    try {
      final batch = List.of(_queue);
      if (await post(endpoint, jsonEncode({'errors': batch}))) {
        _queue.removeRange(0, batch.length);
      }
    } catch (_) {
      /* Keep the queue for the next try. */
    } finally {
      _sending = false;
    }
  }

  static Future<bool> _post(Uri endpoint, String body) async {
    final client = HttpClient()
      ..connectionTimeout = const Duration(seconds: 10);
    try {
      final request = await client.postUrl(endpoint);
      request.headers.contentType = ContentType.json;
      request.write(body);
      final response = await request.close().timeout(
        const Duration(seconds: 10),
      );
      await response.drain<void>();
      // 4xx (a rejected payload, the throttle) will not get better on retry.
      return response.statusCode < 500;
    } finally {
      client.close(force: true);
    }
  }
}

/// The build this shell is: a store flavor, the direct APK or the macOS app.
String shellClient() =>
    buildStore ??
    (defaultTargetPlatform == TargetPlatform.macOS ? 'macos' : 'direct_apk');

final _query = RegExp(r'\?\S*');

/// One entry of `clientErrorBatchSchema` (`app: native`). URLs in the message lose their query.
Map<String, Object?> nativeError(
  Object error,
  StackTrace? stack, {
  required String path,
  required bool online,
  String? client,
}) {
  final message = error.toString().replaceAll(_query, '');
  final cleanPath = (Uri.tryParse(path)?.path ?? '/').trim();
  return {
    'app': 'native',
    'kind': 'error',
    'message': _cut(message.isEmpty ? 'Error' : message, 500),
    if (stack != null && '$stack'.trim().isNotEmpty)
      'stack': _cut('$stack'.replaceAll(_query, ''), 6000),
    'path': _cut(cleanPath.isEmpty ? '/' : cleanPath, 200),
    'version': shellVersion,
    'client': client ?? shellClient(),
    'online': online,
  };
}

String _cut(String s, int max) => s.length <= max ? s : s.substring(0, max);

/// A main-frame page that did not load, as an error the monitor can group.
class PageLoadError implements Exception {
  PageLoadError(this.type, this.code, this.description);
  final String type;
  final int code;
  final String description;
  @override
  String toString() => 'PageLoadError: $type ($code) $description';
}
