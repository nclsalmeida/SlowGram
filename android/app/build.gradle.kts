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

android {
    namespace = "com.slowgram.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.slowgram.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
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
    // Runtime: zero third-party dependencies — the app is a thin framework
    // (Activity + WebView) host. Local-first, auditable.
    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
}
