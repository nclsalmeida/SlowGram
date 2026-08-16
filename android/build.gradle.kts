// SlowGram Android wrapper — root build.
// Declares plugin versions once (libs.versions.toml); no logic here.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
}
