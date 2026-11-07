plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android { namespace = "com.bmrinc.earthweatherwidget"; compileSdk = 35; defaultConfig { applicationId = "com.bmrinc.earthweatherwidget"; minSdk = 26; targetSdk = 35; versionCode = 1; versionName = "1.0.0" } }
dependencies { implementation("androidx.core:core-ktx:1.15.0"); implementation("androidx.work:work-runtime-ktx:2.10.0"); implementation("com.google.android.gms:play-services-location:21.3.0") }
