import 'dart:async';

import 'package:flutter/services.dart';

import 'store_billing.dart';

/// Store install handoff (growth roadmap, «Store install attribution»): the landing page puts only the random
/// growth visitor ID into the Myket link (`referrer=vid=<id>`). On first launch the store build reads it and opens
/// the app once with `?aio_vid=<id>`; the web app keeps that ID, so an in-app signup inherits the web visit's source.
const _channel = MethodChannel('ir.poshtetgarm.hybrid/install');
final _uuid = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  caseSensitive: false,
);

/// The visitor ID in a store referrer, or null for anything else.
String? visitorFromReferrer(String? referrer) {
  if (referrer == null || !referrer.startsWith('vid=')) return null;
  final id = referrer.substring(4);
  return _uuid.hasMatch(id) ? id.toLowerCase() : null;
}

Uri withVisitor(Uri url, String? visitorId) => visitorId == null
    ? url
    : url.replace(
        queryParameters: {...url.queryParameters, 'aio_vid': visitorId},
      );

/// The first page to open. The native side answers only once per install, so later launches open [url] as is.
Future<Uri> installStartUrl(Uri url) async {
  if (buildStore == null) return url;
  try {
    final referrer = await _channel
        .invokeMethod<String>('referrer')
        .timeout(const Duration(seconds: 3));
    return withVisitor(url, visitorFromReferrer(referrer));
  } catch (_) {
    return url; // Attribution never delays or blocks opening the app.
  }
}
