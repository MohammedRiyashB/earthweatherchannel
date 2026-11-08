plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val startUrl = providers.gradleProperty("earthWeatherStartUrl")
    .orElse("https://earthweatherchannel.web.app/")
    .get()

android {
    namespace = "com.earthweather.mobile"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.earthweather.mobile"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "START_URL", "\"$startUrl\"")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources {
            excludes += setOf(
                "META-INF/LICENSE*",
                "META-INF/NOTICE*",
            )
        }
    }
}
