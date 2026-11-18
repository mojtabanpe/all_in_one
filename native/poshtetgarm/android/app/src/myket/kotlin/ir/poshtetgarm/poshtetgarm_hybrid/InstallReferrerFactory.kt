package ir.poshtetgarm.poshtetgarm_hybrid

import android.content.Context
import android.os.Handler
import android.os.Looper
import ir.myket.referrersdk.api.InstallReferrerResponse
import ir.myket.referrersdk.api.InstallReferrerStateListener
import ir.myket.referrersdk.api.MyketReferrerClient

/** Myket's install referrer (ir.myket:referrersdk). The answer is delivered on the main thread exactly once. */
fun queryInstallReferrer(context: Context, done: (referrer: String?, final: Boolean) -> Unit) {
    val main = Handler(Looper.getMainLooper())
    var answered = false
    val client = MyketReferrerClient.newBuilder(context).build()
    fun answer(referrer: String?, final: Boolean) {
        main.post {
            if (answered) return@post
            answered = true
            runCatching { client.endConnection() }
            done(referrer, final)
        }
    }
    try {
        client.startConnection(object : InstallReferrerStateListener {
            override fun onInstallReferrerSetupFinished(responseCode: Int) {
                when (responseCode) {
                    InstallReferrerResponse.OK -> {
                        val value = runCatching { client.getInstallReferrer().installReferrer }.getOrNull()
                        answer(value?.takeIf { it.isNotEmpty() }, value != null)
                    }
                    InstallReferrerResponse.NOT_FOUND,
                    InstallReferrerResponse.FEATURE_NOT_SUPPORTED,
                    InstallReferrerResponse.DEVELOPER_ERROR -> answer(null, true)
                    else -> answer(null, false)
                }
            }

            override fun onInstallReferrerServiceDisconnected() = answer(null, false)
        })
    } catch (_: Exception) {
        answer(null, false)
    }
}
