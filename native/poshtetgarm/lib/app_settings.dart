import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

const productionUrl = 'https://poshtetgarm.ir/app/';
const buildUrl = String.fromEnvironment('APP_URL');

Uri parseAppUrl(String value) {
  final uri = Uri.tryParse(value.trim());
  if (uri == null ||
      !uri.hasAuthority ||
      uri.host.isEmpty ||
      uri.userInfo.isNotEmpty ||
      (uri.scheme != 'https' &&
          !(uri.scheme == 'http' &&
              {
                'localhost',
                '127.0.0.1',
                '::1',
                '10.0.2.2',
              }.contains(uri.host)))) {
    throw const FormatException('Use an HTTPS address, or HTTP on localhost.');
  }
  return uri;
}

bool isAppNavigation(Uri target, Uri app) =>
    target.scheme == app.scheme &&
    target.host == app.host &&
    target.port == app.port;

class AppSettings {
  Future<File> get _file async {
    final dir = await getApplicationSupportDirectory();
    await dir.create(recursive: true);
    return File('${dir.path}/settings.json');
  }

  Future<Uri> load() async {
    if (buildUrl.isNotEmpty) return parseAppUrl(buildUrl);
    try {
      final json = jsonDecode(await (await _file).readAsString());
      return parseAppUrl(json['url'] as String);
    } on FileSystemException {
      return Uri.parse(productionUrl);
    } on FormatException {
      return Uri.parse(productionUrl);
    } on TypeError {
      return Uri.parse(productionUrl);
    }
  }

  Future<void> save(Uri url) async {
    final file = await _file;
    final temp = File('${file.path}.tmp');
    await temp.writeAsString(jsonEncode({'url': url.toString()}), flush: true);
    await temp.rename(file.path);
  }
}
