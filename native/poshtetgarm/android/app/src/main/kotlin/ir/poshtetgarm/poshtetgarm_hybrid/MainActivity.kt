package ir.poshtetgarm.poshtetgarm_hybrid

import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * A FragmentActivity so store billing SDKs can use the activity result registry. The store channel answers the
 * WebView bridge (lib/store_billing.dart); the direct build has no store and refuses every call.
 */
class MainActivity : FlutterFragmentActivity() {
    private var billing: StoreBilling? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        billing = createStoreBilling(this)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "ir.poshtetgarm.hybrid/store")
            .setMethodCallHandler { call, result ->
                val store = billing
                if (store == null) {
                    result.error(StoreBilling.UNAVAILABLE, null, null)
                    return@setMethodCallHandler
                }
                val reply = { outcome: kotlin.Result<Any?> ->
                    outcome.fold(
                        onSuccess = { result.success(it) },
                        onFailure = { result.error(StoreBilling.codeOf(it), null, null) },
                    )
                }
                when (call.method) {
                    "products" -> store.products(call.argument<List<String>>("skus").orEmpty(), reply)
                    "purchase" -> {
                        val sku = call.argument<String>("sku")
                        val payload = call.argument<String>("payload")
                        if (sku == null || payload == null) result.error(StoreBilling.FAILED, null, null)
                        else store.purchase(sku, payload, reply)
                    }
                    "purchases" -> store.purchases(reply)
                    "consume" -> {
                        val token = call.argument<String>("purchaseToken")
                        if (token == null) result.error(StoreBilling.FAILED, null, null)
                        else store.consume(token, reply)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    override fun onDestroy() {
        billing?.dispose()
        billing = null
        super.onDestroy()
    }
}
