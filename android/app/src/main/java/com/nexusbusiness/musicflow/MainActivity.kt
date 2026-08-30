package com.nexusbusiness.musicflow

import android.annotation.SuppressLint
import android.net.Uri
import android.os.Bundle
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.gms.ads.AdListener
import com.google.android.gms.ads.AdLoader
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.nativead.MediaView
import com.google.android.gms.ads.nativead.NativeAd
import com.google.android.gms.ads.nativead.NativeAdOptions
import com.google.android.gms.ads.nativead.NativeAdView
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var adViewContainer: FrameLayout
    private lateinit var nativeAdContainer: FrameLayout
    private var adView: AdView? = null
    private var nativeAd: NativeAd? = null
    private lateinit var consentInformation: ConsentInformation
    private var adsRequested = false

    private val APP_URL = "https://nexusbusiness-ofc.github.io/musicflow/"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        adViewContainer = findViewById(R.id.adViewContainer)
        nativeAdContainer = findViewById(R.id.nativeAdContainer)

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
            loadNativeAd()
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

    private fun loadNativeAd() {
        AdLoader.Builder(this, BuildConfig.ADMOB_NATIVE_AD_UNIT_ID)
            .forNativeAd { loadedNativeAd ->
                if (isFinishing || isDestroyed) {
                    loadedNativeAd.destroy()
                    return@forNativeAd
                }
                nativeAd?.destroy()
                nativeAd = loadedNativeAd
                displayNativeAd(loadedNativeAd)
            }
            .withNativeAdOptions(NativeAdOptions.Builder().build())
            .withAdListener(object : AdListener() {
                override fun onAdFailedToLoad(error: LoadAdError) {
                    nativeAdContainer.removeAllViews()
                    nativeAdContainer.visibility = View.GONE
                }
            })
            .build()
            .loadAd(AdRequest.Builder().build())
    }

    private fun displayNativeAd(ad: NativeAd) {
        val nativeAdView = NativeAdView(this)
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(12), dp(16), dp(14))
            background = GradientDrawable().apply {
                setColor(Color.rgb(22, 25, 37))
                cornerRadius = dp(20).toFloat()
                setStroke(dp(1), Color.argb(48, 255, 255, 255))
            }
        }
        nativeAdView.addView(card, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
        ).apply { setMargins(dp(12), dp(4), dp(12), dp(8)) })

        val label = TextView(this).apply {
            text = "Publicidade"
            setTextColor(Color.rgb(148, 163, 184))
            textSize = 10f
            letterSpacing = 0.10f
        }
        card.addView(label)

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(6), 0, 0)
        }
        val icon = ImageView(this).apply {
            layoutParams = LinearLayout.LayoutParams(dp(42), dp(42)).apply { marginEnd = dp(10) }
        }
        nativeAdView.iconView = icon
        if (ad.icon == null) icon.visibility = View.GONE else icon.setImageDrawable(ad.icon?.drawable)
        row.addView(icon)

        val textColumn = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val headline = TextView(this).apply {
            text = ad.headline
            setTextColor(Color.WHITE)
            textSize = 15f
            maxLines = 1
        }
        nativeAdView.headlineView = headline
        textColumn.addView(headline)
        val body = TextView(this).apply {
            text = ad.body
            setTextColor(Color.rgb(203, 213, 225))
            textSize = 12f
            maxLines = 2
            visibility = if (ad.body == null) View.GONE else View.VISIBLE
        }
        nativeAdView.bodyView = body
        textColumn.addView(body)
        row.addView(textColumn)
        card.addView(row)

        val mediaView = MediaView(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(120)).apply {
                topMargin = dp(10)
            }
            visibility = if (ad.mediaContent == null) View.GONE else View.VISIBLE
        }
        nativeAdView.mediaView = mediaView
        card.addView(mediaView)

        val cta = TextView(this).apply {
            text = ad.callToAction
            gravity = Gravity.CENTER
            setTextColor(Color.rgb(6, 18, 12))
            textSize = 12f
            setPadding(dp(12), dp(9), dp(12), dp(9))
            background = GradientDrawable().apply {
                setColor(Color.rgb(52, 211, 153))
                cornerRadius = dp(12).toFloat()
            }
            visibility = if (ad.callToAction == null) View.GONE else View.VISIBLE
        }
        nativeAdView.callToActionView = cta
        card.addView(cta, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(12) })

        nativeAdView.setNativeAd(ad)
        nativeAdContainer.removeAllViews()
        nativeAdContainer.addView(nativeAdView)
        nativeAdContainer.visibility = View.VISIBLE
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

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
        nativeAd?.destroy()
        nativeAd = null
        super.onDestroy()
    }
}
