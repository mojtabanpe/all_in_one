import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:poshtetgarm_hybrid/main.dart';
import 'package:poshtetgarm_hybrid/app_settings.dart';
import 'package:poshtetgarm_hybrid/native_push.dart';
import 'package:poshtetgarm_hybrid/install_referrer.dart';
import 'package:poshtetgarm_hybrid/store_billing.dart';

void main() {
  test(
    'store install referrer passes only a visitor ID into the start URL',
    () {
      const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
      expect(visitorFromReferrer('vid=$id'), id);
      for (final value in [
        null,
        '',
        id,
        'vid=x',
        'utm_source=linkedin',
        'vid=$id&a=1',
      ]) {
        expect(visitorFromReferrer(value), isNull);
      }
      final app = Uri.parse('https://poshtetgarm.ir/app/');
      expect(withVisitor(app, null), app);
      expect(
        withVisitor(app, id).toString(),
        'https://poshtetgarm.ir/app/?aio_vid=$id',
      );
    },
  );

  test('notification links stay inside the trusted app', () {
    expect(notificationDestination('/app/english')?.path, '/app/english');
    expect(
      notificationDestination('/app/planner?task=test')?.query,
      'task=test',
    );
    for (final value in [
      'https://evil.test/app/',
      '//evil.test/app/',
      '/admin/',
      '/app/../../api/auth',
      'javascript:alert(1)',
    ]) {
      expect(notificationDestination(value), isNull);
    }
    expect(
      trustedPushOrigin(Uri.parse('https://poshtetgarm.ir.evil.test')),
      isFalse,
    );
    expect(
      trustedPushOrigin(Uri.parse('https://poshtetgarm.ir:8443')),
      isFalse,
    );
  });
  test('accepts HTTPS and supported development hosts', () {
    for (final value in [
      productionUrl,
      ' https://example.com/app ',
      'http://localhost:4400',
      'http://127.0.0.1:4400',
      'http://10.0.2.2:4400',
    ]) {
      expect(parseAppUrl(value).hasAuthority, isTrue);
    }
  });
  test('rejects unsafe or incomplete app addresses', () {
    for (final value in [
      '',
      'example.com',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'http://example.com',
      'https://user:pass@example.com',
    ]) {
      expect(() => parseAppUrl(value), throwsFormatException);
    }
  });
  test('only the configured origin stays in the WebView', () {
    final app = parseAppUrl(productionUrl);
    expect(isAppNavigation(Uri.parse('${productionUrl}english'), app), isTrue);
    for (final value in [
      'https://poshtetgarm.ir.evil.test',
      'https://poshtetgarm.ir:8443',
      'http://poshtetgarm.ir',
    ]) {
      expect(isAppNavigation(Uri.parse(value), app), isFalse);
    }
  });
  testWidgets(
    'address form validates before opening and provides local preset',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: AddressDialog(url: Uri.parse(productionUrl))),
        ),
      );
      await tester.enterText(find.byType(TextFormField), 'javascript:alert(1)');
      await tester.tap(find.text('Save and open'));
      await tester.pump();
      expect(
        find.text('Use an HTTPS address, or HTTP on localhost.'),
        findsOneWidget,
      );
      await tester.tap(find.text('Use local server'));
      await tester.pump();
      expect(find.text('http://10.0.2.2:4400'), findsOneWidget);
    },
  );

  test('store builds are recognized from the flavor and never open the web gateway', () {
    expect(storeOf('bazaar'), 'bazaar');
    expect(storeOf('myket'), 'myket');
    expect(storeOf('direct'), isNull);
    expect(storeOf(null), isNull);
    expect(
      storeUserAgent('Mozilla/5.0 (Linux; Android 14)', 'bazaar'),
      'Mozilla/5.0 (Linux; Android 14) PoshtetgarmStore/bazaar',
    );
    expect(storeUserAgent(null, 'myket'), 'PoshtetgarmStore/myket');
    expect(
      shellUserAgent('Mozilla/5.0 (Linux; Android 14)'),
      'Mozilla/5.0 (Linux; Android 14) PoshtetgarmApp/$shellVersion',
    );
    expect(
      shellUserAgent('Mozilla/5.0 (Linux; Android 14)', store: 'bazaar'),
      'Mozilla/5.0 (Linux; Android 14) PoshtetgarmApp/$shellVersion PoshtetgarmStore/bazaar',
    );
    expect(
      shellUserAgent(null, store: 'myket', version: '1.0.7'),
      'PoshtetgarmApp/1.0.7 PoshtetgarmStore/myket',
    );
    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(pubspec, contains('version: $shellVersion+'));
    expect(
      blockedInStore(Uri.parse('https://gateway.zibal.ir/start/1')),
      isTrue,
    );
    expect(blockedInStore(Uri.parse('https://zibal.ir/')), isTrue);
    expect(blockedInStore(Uri.parse('https://notzibal.ir/')), isFalse);
    expect(
      blockedInStore(Uri.parse('https://poshtetgarm.ir/app/billing')),
      isFalse,
    );
  });

  testWidgets('keyboard inset is applied once it settles, removed at once', (
    tester,
  ) async {
    Widget at(double inset) => MediaQuery(
      data: MediaQueryData(viewInsets: EdgeInsets.only(bottom: inset)),
      child: const KeyboardInset(child: SizedBox.expand()),
    );
    double bottom() => tester
        .widget<Padding>(
          find
              .descendant(
                of: find.byType(KeyboardInset),
                matching: find.byType(Padding),
              )
              .first,
        )
        .padding
        .resolve(TextDirection.ltr)
        .bottom;

    await tester.pumpWidget(at(0));
    for (final inset in [80.0, 160.0, 240.0, 300.0]) {
      await tester.pumpWidget(at(inset));
      expect(bottom(), 0, reason: 'no resize while the keyboard animates');
    }
    await tester.pump(KeyboardInset.settle);
    expect(bottom(), 300);
    await tester.pumpWidget(at(200));
    expect(bottom(), 0, reason: 'closing gives the space back in one step');
    await tester.pumpWidget(at(0));
    await tester.pump(KeyboardInset.settle);
    expect(bottom(), 0);
  });
}
