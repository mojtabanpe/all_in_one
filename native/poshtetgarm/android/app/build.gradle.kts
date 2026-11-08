plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Native resources also initialize FCM when Android starts the app in the background.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

/** A store's in-app billing RSA public key: a public value, so it may come from a gradle property or the CI env. */
fun storeKey(name: String): String =
    ((findProperty(name) as String?) ?: System.getenv(name) ?: "").trim().also {
        require(it.matches(Regex("[A-Za-z0-9+/=]*"))) { "$name must be a base64 public key" }
    }

android {
    namespace = "ir.poshtetgarm.poshtetgarm_hybrid"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "ir.poshtetgarm.poshtetgarm_hybrid"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildFeatures {
        buildConfig = true
    }

    // One APK per distribution channel. Cafe Bazaar and Myket require their own in-app billing for digital
    // goods and forbid any other payment route, so their builds pay through the store; the direct (GitHub
    // Releases) build keeps the web gateway. The store public keys are public values from each store's panel
    // (gradle property or environment variable); the stores' server API secrets never belong in the app.
    signingConfigs {
        // Store uploads must always be signed with the same release key (ANDROID_KEYSTORE_* in CI). The direct
        // build keeps the debug key its installed users already have, so it still updates in place.
        System.getenv("ANDROID_KEYSTORE_PATH")?.takeIf { it.isNotBlank() }?.let { path ->
            create("release") {
                storeFile = file(path)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    flavorDimensions += "store"
    productFlavors {
        create("direct") {
            dimension = "store"
            buildConfigField("String", "STORE_PUBLIC_KEY", "\"\"")
            signingConfig = signingConfigs.getByName("debug")
        }
        create("bazaar") {
            dimension = "store"
            buildConfigField("String", "STORE_PUBLIC_KEY", "\"${storeKey("BAZAAR_RSA_PUBLIC_KEY")}\"")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
        create("myket") {
            dimension = "store"
            buildConfigField("String", "STORE_PUBLIC_KEY", "\"${storeKey("MYKET_RSA_PUBLIC_KEY")}\"")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
            manifestPlaceholders["marketApplicationId"] = "ir.mservices.market"
            manifestPlaceholders["marketBindAddress"] = "ir.mservices.market.InAppBillingService.BIND"
            manifestPlaceholders["marketPermission"] = "ir.mservices.market.BILLING"
        }
    }

    buildTypes {
        release {
            // Each flavor above picks its signing key.
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    // MainActivity is a FlutterFragmentActivity (store billing needs the activity result registry).
    implementation("androidx.fragment:fragment-ktx:1.8.5")
    "bazaarImplementation"("com.github.cafebazaar.Poolakey:poolakey:2.3.0")
    "myketImplementation"("ir.myket:billing:2.2")
}
