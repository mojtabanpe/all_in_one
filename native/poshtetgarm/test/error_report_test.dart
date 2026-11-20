import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:poshtetgarm_hybrid/error_report.dart';
import 'package:poshtetgarm_hybrid/store_billing.dart';

void main() {
  test('a native error has only the schema fields and no query strings', () {
    final entry = nativeError(
      StateError('failed https://poshtetgarm.ir/app/x?token=secret now'),
      StackTrace.fromString(
        '#0 main (package:a/main.dart:3:1) https://x.ir/?k=v',
      ),
      path: 'https://poshtetgarm.ir/app/planner?code=123#frag',
      online: false,
      client: 'bazaar',
    );
    expect(entry.keys.toSet(), {
      'app',
      'kind',
      'message',
      'stack',
      'path',
      'version',
      'client',
      'online',
    });
    expect(entry['app'], 'native');
    expect(entry['path'], '/app/planner');
    expect(entry['version'], shellVersion);
    expect(entry['online'], false);
    expect('${entry['message']}${entry['stack']}', isNot(contains('secret')));
    expect('${entry['stack']}', isNot(contains('k=v')));
    expect(
      (nativeError('x' * 900, null, path: '/', online: true)['message']
              as String)
          .length,
      500,
    );
  });

  test('repeats are dropped, failures are kept and retried', () async {
    final sent = <List<dynamic>>[];
    var up = false;
    final report = ErrorReport(
      endpoint: Uri.parse('https://example.test/api/monitor/errors'),
      post: (_, body) async {
        if (!up) return false;
        sent.add((jsonDecode(body) as Map)['errors'] as List);
        return true;
      },
    );
    report.report(StateError('a'), null);
    report.report(StateError('a'), null);
    await Future<void>.delayed(Duration.zero);
    expect(sent, isEmpty);
    up = true;
    report.report(StateError('b'), null);
    await Future<void>.delayed(Duration.zero);
    await report.flush();
    expect(sent.expand((b) => b).map((e) => e['message']).toList(), [
      'Bad state: a',
      'Bad state: b',
    ]);
  });
}
