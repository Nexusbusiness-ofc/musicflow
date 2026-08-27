/**
 * MusicFlow AdMob & Google Ads Monetization Service
 * Handles Google AdMob App ID: ca-app-pub-2898806335291249~9336449403
 * Banner Ad Unit ID: ca-app-pub-2898806335291249/6730467364
 */

class AdMobService {
  constructor() {
    this.config = {
      publisherId: 'ca-pub-2898806335291249',
      appId: 'ca-app-pub-2898806335291249~9336449403',
      bannerAdUnitId: 'ca-app-pub-2898806335291249/6730467364',
      isNativeAdMobAvailable: false,
      initialized: false
    };

    this.init();
  }

  async init() {
    if (window.admob || window.AdMob) {
      this.config.isNativeAdMobAvailable = true;
      try {
        if (window.AdMob && window.AdMob.initialize) {
          await window.AdMob.initialize({
            requestTrackingAuthorization: true,
            testingDevices: []
          });
          this.showNativeBanner();
        }
      } catch (err) {
        console.warn('Native AdMob init fallback to web ads:', err);
      }
    }

    this.refreshWebAds();
    this.config.initialized = true;
  }

  refreshWebAds() {
    try {
      if (window.adsbygoogle && Array.isArray(window.adsbygoogle)) {
        const slots = document.querySelectorAll('ins.adsbygoogle[data-ad-client]');
        slots.forEach(slot => {
          if (!slot.getAttribute('data-adsbygoogle-status')) {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
          }
        });
      }
    } catch (e) {
      console.debug('AdMob web refresh notice:', e);
    }
  }

  async showNativeBanner() {
    if (!this.config.isNativeAdMobAvailable) return;
    try {
      if (window.AdMob && window.AdMob.showBanner) {
        await window.AdMob.showBanner({
          adId: this.config.bannerAdUnitId,
          adSize: 'BANNER',
          position: 'BOTTOM_CENTER',
          margin: 60
        });
      }
    } catch (e) {
      console.warn('Failed to show native AdMob banner:', e);
    }
  }
}

// Global singleton instance
window.adMobService = new AdMobService();