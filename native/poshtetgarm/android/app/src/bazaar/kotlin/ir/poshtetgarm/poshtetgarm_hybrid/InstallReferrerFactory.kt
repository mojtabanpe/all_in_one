package ir.poshtetgarm.poshtetgarm_hybrid

import android.content.Context

/**
 * Not read yet: Cafe Bazaar's ReferrerSDK exists, but how a link passes the value is undocumented. Answer "none"
 * without remembering it, so a later build that reads Bazaar's referrer still asks once.
 */
@Suppress("UNUSED_PARAMETER")
fun queryInstallReferrer(context: Context, done: (referrer: String?, final: Boolean) -> Unit) = done(null, false)
