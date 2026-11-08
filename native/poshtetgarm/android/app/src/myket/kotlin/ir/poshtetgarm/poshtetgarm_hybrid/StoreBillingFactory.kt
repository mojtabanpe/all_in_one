package ir.poshtetgarm.poshtetgarm_hybrid

import androidx.fragment.app.FragmentActivity
import ir.myket.billingclient.IabHelper
import ir.myket.billingclient.util.IabResult
import ir.myket.billingclient.util.Purchase

fun createStoreBilling(activity: FragmentActivity): StoreBilling? = MyketBilling(activity)

/**
 * Myket through its billing client (IabHelper). The helper runs one asynchronous operation at a time, so calls
 * are queued and run in order once setup has finished. The public key is a public value from the Myket panel;
 * the server checks every purchase again with Myket's verify API before granting anything.
 */
private class MyketBilling(private val activity: FragmentActivity) : StoreBilling {
    private val helper = IabHelper(activity.applicationContext, BuildConfig.STORE_PUBLIC_KEY)
    private var ready: Boolean? = null
    private var busy = false
    private val queue = ArrayDeque<() -> Unit>()
    /** Purchases seen in this session, because consuming needs the purchase itself, not only its token. */
    private val known = mutableMapOf<String, Purchase>()

    init {
        helper.startSetup { result ->
            ready = result.isSuccess
            next()
        }
    }

    private fun failure(result: IabResult) = StoreBilling.Failure(
        when (result.response) {
            IabHelper.BILLING_RESPONSE_RESULT_BILLING_UNAVAILABLE,
            IabHelper.IABHELPER_IPC_CONNECT_FAILED,
            IabHelper.IABHELPER_BROADCAST_RECEIVER_CONNECT_FAILED,
            IabHelper.IABHELPER_NO_BROADCAST_RECEIVER_SUPPORT,
            IabHelper.IABHELPER_REMOTE_EXCEPTION -> StoreBilling.UNAVAILABLE
            else -> StoreBilling.FAILED
        },
    )

    /** Queues [block]; it must call [finish] exactly once, after its callback has answered. */
    private fun enqueue(done: (Result<Any?>) -> Unit, block: (finish: (Result<Any?>) -> Unit) -> Unit) {
        queue.addLast {
            if (ready != true) {
                done(Result.failure(StoreBilling.Failure(StoreBilling.UNAVAILABLE)))
                busy = false
                next()
                return@addLast
            }
            try {
                block { outcome ->
                    done(outcome)
                    busy = false
                    next()
                }
            } catch (_: Exception) {
                done(Result.failure(StoreBilling.Failure(StoreBilling.FAILED)))
                busy = false
                next()
            }
        }
        next()
    }

    private fun next() {
        if (busy || ready == null) return
        val block = queue.removeFirstOrNull() ?: return
        busy = true
        activity.runOnUiThread(block)
    }

    override fun products(skus: List<String>, done: (Result<Any?>) -> Unit) = enqueue(done) { finish ->
        helper.queryInventoryAsync(true, skus) { result, inventory ->
            if (result.isFailure || inventory == null) finish(Result.failure(failure(result)))
            else finish(Result.success(inventory.allProducts.map {
                mapOf("sku" to it.sku, "price" to it.price, "title" to it.title)
            }))
        }
    }

    override fun purchase(sku: String, payload: String, done: (Result<Any?>) -> Unit) = enqueue(done) { finish ->
        helper.launchPurchaseFlow(activity, sku, { result, purchase ->
            when {
                result.response == IabHelper.IABHELPER_USER_CANCELLED ||
                    result.response == IabHelper.BILLING_RESPONSE_RESULT_USER_CANCELED -> finish(Result.success(null))
                result.isFailure || purchase == null -> finish(Result.failure(failure(result)))
                else -> {
                    known[purchase.token] = purchase
                    finish(Result.success(mapOf("sku" to purchase.sku, "purchaseToken" to purchase.token)))
                }
            }
        }, payload)
    }

    override fun purchases(done: (Result<Any?>) -> Unit) = enqueue(done) { finish ->
        helper.queryInventoryAsync { result, inventory ->
            if (result.isFailure || inventory == null) finish(Result.failure(failure(result)))
            else {
                val owned = inventory.allPurchases.filter { it.purchaseState == 0 }
                owned.forEach { known[it.token] = it }
                finish(Result.success(owned.map { mapOf("sku" to it.sku, "purchaseToken" to it.token) }))
            }
        }
    }

    override fun consume(purchaseToken: String, done: (Result<Any?>) -> Unit) = enqueue(done) { finish ->
        val consume = { purchase: Purchase ->
            helper.consumeAsync(purchase) { _, result ->
                if (result.isSuccess) known.remove(purchaseToken)
                finish(if (result.isSuccess) Result.success(null) else Result.failure(failure(result)))
            }
        }
        val purchase = known[purchaseToken]
        if (purchase != null) consume(purchase)
        else helper.queryInventoryAsync { result, inventory ->
            val owned = inventory?.allPurchases?.firstOrNull { it.token == purchaseToken }
            if (result.isFailure || owned == null) finish(Result.failure(StoreBilling.Failure(StoreBilling.FAILED)))
            else consume(owned)
        }
    }

    override fun dispose() {
        queue.clear()
        try {
            helper.dispose()
        } catch (_: Exception) {
            /* Already disposed. */
        }
    }
}
