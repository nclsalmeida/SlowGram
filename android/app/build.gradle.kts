import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

// ---------------------------------------------------------------------------
// Single-source contract: the engine lives at <repo root>/src/slowgram.js and
// is COPIED (never edited) into assets on every build. If the engine file is
// missing, the build fails loudly instead of shipping a stale copy.
// ---------------------------------------------------------------------------
val engineSource = rootProject.file("../src/slowgram.js")
val engineAsset = layout.projectDirectory.file("src/main/assets/slowgram.js").asFile

val copySlowGramEngine by tasks.registering {
    inputs.file(engineSource)
    outputs.file(engineAsset)
    doLast {
        check(engineSource.exists()) {
            "SlowGram engine not found at ${engineSource.absolutePath}. " +
                "Build the wrapper from the SlowGram repository root so src/slowgram.js is reachable."
        }
        engineAsset.parentFile.mkdirs()
        engineSource.copyTo(engineAsset, overwrite = true)
    }
}

tasks.named("preBuild") {
    dependsOn(copySlowGramEngine)
}

// ---------------------------------------------------------------------------
// Release signing — read from android/keystore.properties (gitignored, never
// committed). When the file is absent (e.g. a fresh clone without the
// keystore), assembleRelease FAILS with a clear message instead of silently
// producing an unsigned APK. assembleDebug is never affected.
// ---------------------------------------------------------------------------
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}

// Release signing gate: a missing keystore.properties fails loudly before
// packaging instead of silently producing an unsigned APK. Wired as a
// dependency of assembleRelease only — assembleDebug is never affected.
val validateReleaseSigning by tasks.registering {
    doFirst {
        check(keystorePropertiesFile.exists()) {
            "keystore.properties not found — see README section \"Assinatura\". " +
                "Release signing is mandatory; the build refuses to produce an unsigned APK."
        }
        check(file(keystoreProperties.getProperty("storeFile")).exists()) {
            "Keystore file not found at \"${keystoreProperties.getProperty("storeFile")}\" " +
                "(from keystore.properties). Fix the path or restore the keystore from backup."
        }
    }
}

tasks.matching { it.name == "assembleRelease" }.configureEach {
    dependsOn(validateReleaseSigning)
}

android {
    namespace = "com.slowgram.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.slowgram.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 2
        versionName = "1.1.0"
    }

    signingConfigs {
        if (keystorePropertiesFile.exists()) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystorePropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true   // BuildConfig.DEBUG gates WebView devtools
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

dependencies {
    // Runtime: the ONLY androidx dependency — androidx.activity, required by
    // the ActivityResultLauncher that powers media uploads (DM/feed/stories
    // file inputs). No analytics, no trackers, local-first, auditable.
    implementation(libs.androidx.activity)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
}
