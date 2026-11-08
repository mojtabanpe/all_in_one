package ir.poshtetgarm.poshtetgarm_hybrid

/**
 * One store's in-app billing. Products are consumables: each purchase is a fixed period of AI access that the
 * server verifies with the store before granting it, and the purchase is consumed only after that. Results are
 * plain maps for the method channel: products `{sku, price, title}`, purchases `{sku, purchaseToken}`; a closed
 * purchase sheet is a null purchase. Failures carry only a code, never store messages or tokens.
 */
interface StoreBilling {
    fun products(skus: List<String>, done: (Result<Any?>) -> Unit)
    fun purchase(sku: String, payload: String, done: (Result<Any?>) -> Unit)
    fun purchases(done: (Result<Any?>) -> Unit)
    fun consume(purchaseToken: String, done: (Result<Any?>) -> Unit)
    fun dispose()

    /** A failure the web page explains: the store app is missing or unreachable, or the purchase failed. */
    class Failure(val code: String) : Exception(code)

    companion object {
        const val UNAVAILABLE = "unavailable"
        const val FAILED = "failed"
        fun codeOf(error: Throwable) = (error as? Failure)?.code ?: FAILED
    }
}
