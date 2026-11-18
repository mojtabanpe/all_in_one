package ir.poshtetgarm.poshtetgarm_hybrid

import android.content.Context

/** The direct (GitHub) build is not installed from a store, so there is no install referrer. */
@Suppress("UNUSED_PARAMETER")
fun queryInstallReferrer(context: Context, done: (referrer: String?, final: Boolean) -> Unit) = done(null, true)
