package ir.poshtetgarm.poshtetgarm_hybrid

import android.content.Context

/**
 * Reads the store install referrer once per install (growth roadmap, «Store install attribution»). Each flavor
 * provides `queryInstallReferrer`; a definite answer (a value, none, or unsupported) is remembered so later launches
 * skip the store, while a failed connection is tried again on the next launch.
 */
object InstallReferrer {
    private const val PREFS = "install_referrer"
    private const val DONE = "done"

    fun read(context: Context, done: (String?) -> Unit) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getBoolean(DONE, false)) return done(null)
        queryInstallReferrer(context.applicationContext) { referrer, final ->
            if (final) prefs.edit().putBoolean(DONE, true).apply()
            done(referrer)
        }
    }
}
