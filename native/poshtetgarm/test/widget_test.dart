import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:poshtetgarm_hybrid/main.dart';
import 'package:poshtetgarm_hybrid/app_settings.dart';
import 'package:poshtetgarm_hybrid/native_push.dart';

void main() {
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
}
