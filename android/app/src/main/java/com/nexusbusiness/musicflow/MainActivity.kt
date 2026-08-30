package com.nexusbusiness.musicflow

import android.annotation.SuppressLint
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import com.google.android.gms.ads.AdListener
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var adViewContainer: FrameLayout
    private var adView: AdView? = null
    private lateinit var consentInformation: ConsentInformation
    private var adsRequested = false

    private val APP_URL = "https://nexusbusiness-ofc.github.io/musicflow/"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        adViewContainer = findViewById(R.id.adViewContainer)

        val webSettings: WebSettings = webView.settings
        webSettings.javaScriptEnabled = true
        webSettings.domStorageEnabled = true
        webSettings.databaseEnabled = true
        webSettings.allowFileAccess = true
        webSettings.mediaPlaybackRequiresUserGesture = false
        webView.addJavascriptInterface(AdMobBridge(), "MusicFlowAndroid")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean = false

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                if (this@MainActivity::consentInformation.isInitialized) updatePrivacyOptionsAvailability()
            }
        }
        webView.loadUrl(APP_URL)

        // Obtém consentimento antes de pedir publicidade, quando necessário.
        gatherConsentAndLoadAds()
    }

    private fun gatherConsentAndLoadAds() {
        consentInformation = UserMessagingPlatform.getConsentInformation(this)
        val consentParameters = ConsentRequestParameters.Builder().build()

        consentInformation.requestConsentInfoUpdate(
            this,
            consentParameters,
            {
                if (consentInformation.canRequestAds()) initializeAds()
                UserMessagingPlatform.loadAndShowConsentFormIfRequired(this) {
                    if (consentInformation.canRequestAds()) initializeAds()
                    updatePrivacyOptionsAvailability()
                }
            },
            {
                // Se existir consentimento válido de uma sessão anterior, os anúncios podem continuar.
                if (consentInformation.canRequestAds()) initializeAds()
                updatePrivacyOptionsAvailability()
            }
        )
    }

    private fun initializeAds() {
        if (adsRequested) return
        adsRequested = true
        MobileAds.initialize(this) {
            loadBannerAd()
        }
    }

    private fun loadBannerAd() {
        adViewContainer.post {
            val banner = AdView(this)
            banner.adUnitId = BuildConfig.ADMOB_BANNER_AD_UNIT_ID
            banner.setAdSize(getAdaptiveAdSize())
            banner.adListener = object : AdListener() {
                override fun onAdLoaded() {
                    adViewContainer.visibility = View.VISIBLE
                }

                override fun onAdFailedToLoad(error: LoadAdError) {
                    adViewContainer.removeAllViews()
                    adViewContainer.visibility = View.GONE
                }
            }
            adView = banner
            adViewContainer.removeAllViews()
            adViewContainer.addView(banner)
            banner.loadAd(AdRequest.Builder().build())
        }
    }

    private fun getAdaptiveAdSize(): AdSize {
        val displayMetrics = resources.displayMetrics
        val widthPixels = adViewContainer.width.takeIf { it > 0 } ?: displayMetrics.widthPixels
        val widthDp = (widthPixels / displayMetrics.density).toInt()
        return AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(this, widthDp)
    }

    private fun updatePrivacyOptionsAvailability() {
        val required = consentInformation.privacyOptionsRequirementStatus ==
            ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED
        webView.post {
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('musicflow:ad-privacy-availability', { detail: { required: $required } }));",
                null
            )
        }
    }

    private inner class AdMobBridge {
        @JavascriptInterface
        fun openPrivacyOptions() {
            runOnUiThread {
                if (isTrustedMusicFlowPage() && this@MainActivity::consentInformation.isInitialized &&
                    consentInformation.privacyOptionsRequirementStatus ==
                    ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED) {
                    UserMessagingPlatform.showPrivacyOptionsForm(this@MainActivity) {
                        updatePrivacyOptionsAvailability()
                    }
                }
            }
        }
    }

    private fun isTrustedMusicFlowPage(): Boolean {
        return Uri.parse(webView.url).host == "nexusbusiness-ofc.github.io"
    }

    @Deprecated("Deprecated in Android API 33")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        adView?.destroy()
        adView = null
        super.onDestroy()
    }
}
