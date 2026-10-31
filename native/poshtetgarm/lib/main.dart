import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import 'app_settings.dart';
import 'native_push.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const PoshtetgarmApp());
}

class PoshtetgarmApp extends StatelessWidget {
  const PoshtetgarmApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Poshtetgarm',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(colorSchemeSeed: const Color(0xff177568)),
    darkTheme: ThemeData(
      colorSchemeSeed: const Color(0xff177568),
      brightness: Brightness.dark,
    ),
    home: const PoshtetgarmWindow(),
  );
}

class PoshtetgarmWindow extends StatefulWidget {
  const PoshtetgarmWindow({super.key});
  @override
  State<PoshtetgarmWindow> createState() => _PoshtetgarmWindowState();
}

class _PoshtetgarmWindowState extends State<PoshtetgarmWindow>
    with WidgetsBindingObserver {
  late final _push = NativePush(navigate: (url) => _load(url));
  final _settings = AppSettings();
  WebViewController? _controller;
  Uri _appUrl = Uri.parse(productionUrl);
  String? _error;
  static const _menuChannel = MethodChannel('ir.poshtetgarm.hybrid/window');
  bool _back = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_push.initialize().catchError((Object _) {}));
    if (defaultTargetPlatform == TargetPlatform.macOS) {
      _menuChannel.setMethodCallHandler((call) async {
        switch (call.method) {
          case 'reload':
            await _reload();
          case 'showSettings':
            await _showSettings();
          case 'goBack':
            await _controller?.goBack();
          case 'goForward':
            await _controller?.goForward();
        }
      });
      unawaited(_menuChannel.invokeMethod<void>('ready'));
    }
    unawaited(_initialize());
  }

  @override
  void dispose() {
    if (defaultTargetPlatform == TargetPlatform.macOS) {
      _menuChannel.setMethodCallHandler(null);
    }
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_push.dispose());
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_push.refresh());
  }

  Future<void> _initialize() async {
    try {
      final url = await _settings.load();
      if (!mounted) return;
      if (kIsWeb ||
          !{
            TargetPlatform.macOS,
            TargetPlatform.iOS,
            TargetPlatform.android,
          }.contains(defaultTargetPlatform)) {
        throw UnsupportedError('This build supports macOS, iOS and Android.');
      }
      final params = WebViewPlatform.instance is WebKitWebViewPlatform
          ? WebKitWebViewControllerCreationParams(
              allowsInlineMediaPlayback: true,
              mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
            )
          : const PlatformWebViewControllerCreationParams();
      final controller = WebViewController.fromPlatformCreationParams(params);
      await controller.setJavaScriptMode(JavaScriptMode.unrestricted);
      await controller.addJavaScriptChannel(
        'NativePushChannel',
        onMessageReceived: (message) => unawaited(_push.handle(message)),
      );
      await controller.setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            _push.pageStarted();
            if (mounted) {
              setState(() {
                _error = null;
              });
            }
          },
          onPageFinished: (url) {
            final uri = Uri.tryParse(url);
            if (uri != null) unawaited(_push.attach(controller, uri));
            if (mounted) {
              unawaited(_history());
            }
          },
          onUrlChange: (_) => unawaited(_history()),
          onWebResourceError: (error) {
            if (mounted && error.isForMainFrame == true) {
              setState(() {
                _error = 'Could not load Poshtetgarm. Check your connection or the app address, then try again.';
              });
            }
          },
          onNavigationRequest: (request) async {
            final uri = Uri.tryParse(request.url);
            if (uri == null) return NavigationDecision.prevent;
            if (!request.isMainFrame ||
                isAppNavigation(uri, _appUrl) ||
                request.url == 'about:blank') {
              return NavigationDecision.navigate;
            }
            if ({'https', 'http', 'mailto', 'tel'}.contains(uri.scheme)) {
              await _external(uri);
            }
            return NavigationDecision.prevent;
          },
        ),
      );
      if (!mounted) return;
      setState(() {
        _controller = controller;
        _appUrl = url;
        _error = null;
      });
      await _load(url);
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = 'Could not start the WebView. $error';
        });
      }
    }
  }

  Future<void> _external(Uri uri) async {
    try {
      if (await launchUrl(uri, mode: LaunchMode.externalApplication)) return;
    } catch (_) {
      /* Show recovery below. */
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not open this link in your browser.'),
        ),
      );
    }
  }

  Future<void> _history() async {
    final controller = _controller;
    if (controller == null) return;
    final back = await controller.canGoBack();
    if (mounted) {
      setState(() {
        _back = back;
      });
    }
  }

  Future<void> _load(Uri url) async {
    if (_controller == null) {
      await _initialize();
      return;
    }
    setState(() {
      _error = null;
    });
    try {
      await _controller!.loadRequest(url);
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Could not load Poshtetgarm. Check the app address and try again.';
        });
      }
    }
  }

  Future<void> _reload() async {
    if (_controller == null) {
      await _initialize();
      return;
    }
    if (_error != null) {
      await _load(_appUrl);
      return;
    }
    await _controller!.reload();
  }

  Future<void> _showSettings() async {
    final url = await showDialog<Uri>(
      context: context,
      builder: (_) => AddressDialog(url: _appUrl),
    );
    if (url == null || !mounted) return;
    try {
      if (!isAppNavigation(url, _appUrl)) await _push.disable();
      await _settings.save(url);
      if (!mounted) return;
      setState(() => _appUrl = url);
      await _load(url);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not save the address. Try again.'),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_back,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop) unawaited(_controller?.goBack());
    },
    child: Scaffold(
      body: SafeArea(
        child: _error != null
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 440),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.cloud_off_outlined, size: 40),
                        const SizedBox(height: 16),
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 8),
                        Text(
                          _appUrl.toString(),
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: _reload,
                          child: const Text('Try again'),
                        ),
                        TextButton(
                          onPressed: _showSettings,
                          child: const Text('Change app address'),
                        ),
                      ],
                    ),
                  ),
                ),
              )
            : _controller == null
            ? const Center(child: CircularProgressIndicator())
            : WebViewWidget(controller: _controller!),
      ),
    ),
  );
}

class AddressDialog extends StatefulWidget {
  const AddressDialog({super.key, required this.url});
  final Uri url;
  @override
  State<AddressDialog> createState() => _AddressDialogState();
}

class _AddressDialogState extends State<AddressDialog> {
  late final _text = TextEditingController(text: widget.url.toString());
  final _form = GlobalKey<FormState>();
  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  void _submit() {
    if (_form.currentState!.validate()) {
      Navigator.pop(context, parseAppUrl(_text.text));
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('App address'),
    content: SizedBox(
      width: 420,
      child: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Open the hosted app or your local Angular server.'),
            const SizedBox(height: 16),
            TextFormField(
              controller: _text,
              autofocus: true,
              keyboardType: TextInputType.url,
              autocorrect: false,
              decoration: const InputDecoration(
                labelText: 'URL',
                hintText: productionUrl,
                border: OutlineInputBorder(),
              ),
              validator: (value) {
                try {
                  parseAppUrl(value ?? '');
                  return null;
                } on FormatException catch (error) {
                  return error.message;
                }
              },
              onFieldSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                TextButton(
                  onPressed: () => _text.text = productionUrl,
                  child: const Text('Use online app'),
                ),
                TextButton(
                  onPressed: () => _text.text =
                      defaultTargetPlatform == TargetPlatform.android
                      ? 'http://10.0.2.2:4400'
                      : 'http://localhost:4400',
                  child: const Text('Use local server'),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(onPressed: _submit, child: const Text('Save and open')),
    ],
  );
}
