plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "com.nexusbusiness.musicflow"
  compileSdk = 35

  defaultConfig {
    applicationId = "com.nexusbusiness.musicflow"
    minSdk = 24
    targetSdk = 35
    versionCode = 1
    versionName = "1.0.0"

    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    buildConfigField("String", "ADMOB_BANNER_AD_UNIT_ID", "\"ca-app-pub-2898806335291249/7684757702\"")
  }

  buildTypes {
    debug {
      // O ID oficial de teste impede impressões/cliques reais durante o desenvolvimento.
      buildConfigField("String", "ADMOB_BANNER_AD_UNIT_ID", "\"ca-app-pub-3940256099942544/9214589741\"")
    }
    release {
      isMinifyEnabled = false
      proguardFiles(
        getDefaultProguardFile("proguard-android-optimize.txt"),
        "proguard-rules.pro"
      )
    }
  }

  buildFeatures {
    buildConfig = true
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_1_8
    targetCompatibility = JavaVersion.VERSION_1_8
  }

  kotlinOptions {
    jvmTarget = "1.8"
  }
}

dependencies {
  implementation("androidx.core:core-ktx:1.12.0")
  implementation("androidx.appcompat:appcompat:1.6.1")
  implementation("com.google.android.material:material:1.11.0")
  implementation("androidx.webkit:webkit:1.10.0")

  // Google Mobile Ads SDK (AdMob)
  implementation("com.google.android.gms:play-services-ads:25.4.0")
  // Consentimento de privacidade para anúncios (Google UMP / GDPR)
  implementation("com.google.android.ump:user-messaging-platform:4.0.0")
}
