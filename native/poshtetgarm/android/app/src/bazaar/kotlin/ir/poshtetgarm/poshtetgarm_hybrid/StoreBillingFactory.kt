package ir.poshtetgarm.poshtetgarm_hybrid

import android.content.pm.PackageManager
import androidx.fragment.app.FragmentActivity
import ir.cafebazaar.poolakey.Connection
import ir.cafebazaar.poolakey.Payment
import ir.cafebazaar.poolakey.config.PaymentConfiguration
import ir.cafebazaar.poolakey.config.SecurityCheck
import ir.cafebazaar.poolakey.entity.PurchaseState
import ir.cafebazaar.poolakey.request.PurchaseRequest

fun createStoreBilling(activity: FragmentActivity): StoreBilling? = BazaarBilling(activity)

/**
 * Cafe Bazaar through Poolakey. Purchases are signed by Bazaar and checked on the device with the app's RSA
 * public key (a public value from the Bazaar panel, set at build time); the server checks them again with the
 * Pardakht API before granting anything.
 */
private class BazaarBilling(private val activity: FragmentActivity) : StoreBilling {
    private val payment = Payment(
        context = activity.applicationContext,
        config = PaymentConfiguration(
            localSecurityCheck = if (BuildConfig.STORE_PUBLIC_KEY.isEmpty()) SecurityCheck.Disable
            else SecurityCheck.Enable(rsaPublicKey = BuildConfig.STORE_PUBLIC_KEY),
        ),
    )
    private var connection: Connection? = null
    private var connected = false
    private val waiting = mutableListOf<(Throwable?) -> Unit>()

    private fun installed() = try {
        activity.packageManager.getPackageInfo("com.farsitel.bazaar", 0)
        true
    } catch (_: PackageManager.NameNotFoundException) {
        false
    }

    /** Runs [block] once Bazaar is connected; calls made while connecting wait for the same connection. */
    private fun connected(done: (Result<Any?>) -> Unit, block: () -> Unit) {
        if (connected) return block()
        if (!installed()) return done(Result.failure(StoreBilling.Failure(StoreBilling.UNAVAILABLE)))
        waiting += { error -> if (error == null) block() else done(Result.failure(error)) }
        if (connection != null) return
        val settle = { error: Throwable? ->
            val calls = waiting.toList()
            waiting.clear()
            calls.forEach { it(error) }
        }
        connection = payment.connect {
            connectionSucceed {
                connected = true
                settle(null)
            }
            connectionFailed {
                connection = null
                settle(StoreBilling.Failure(StoreBilling.UNAVAILABLE))
            }
            disconnected {
                connected = false
                connection = null
                settle(StoreBilling.Failure(StoreBilling.UNAVAILABLE))
            }
        }
    }

    override fun products(skus: List<String>, done: (Result<Any?>) -> Unit) = connected(done) {
        payment.getInAppSkuDetails(skus) {
            getSkuDetailsSucceed { list ->
                done(Result.success(list.map { mapOf("sku" to it.sku, "price" to it.price, "title" to it.title) }))
            }
            getSkuDetailsFailed { done(Result.failure(StoreBilling.Failure(StoreBilling.FAILED))) }
        }
    }

    override fun purchase(sku: String, payload: String, done: (Result<Any?>) -> Unit) = connected(done) {
        payment.purchaseProduct(activity.activityResultRegistry, PurchaseRequest(productId = sku, payload = payload)) {
            purchaseSucceed { done(Result.success(mapOf("sku" to it.productId, "purchaseToken" to it.purchaseToken))) }
            purchaseCanceled { done(Result.success(null)) }
            purchaseFailed { done(Result.failure(StoreBilling.Failure(StoreBilling.FAILED))) }
            failedToBeginFlow { done(Result.failure(StoreBilling.Failure(StoreBilling.UNAVAILABLE))) }
        }
    }

    override fun purchases(done: (Result<Any?>) -> Unit) = connected(done) {
        payment.getPurchasedProducts {
            querySucceed { list ->
                done(Result.success(list.filter { it.purchaseState == PurchaseState.PURCHASED }
                    .map { mapOf("sku" to it.productId, "purchaseToken" to it.purchaseToken) }))
            }
            queryFailed { done(Result.failure(StoreBilling.Failure(StoreBilling.UNAVAILABLE))) }
        }
    }

    override fun consume(purchaseToken: String, done: (Result<Any?>) -> Unit) = connected(done) {
        payment.consumeProduct(purchaseToken) {
            consumeSucceed { done(Result.success(null)) }
            consumeFailed { done(Result.failure(StoreBilling.Failure(StoreBilling.FAILED))) }
        }
    }

    override fun dispose() {
        connection?.disconnect()
        connection = null
        connected = false
    }
}
