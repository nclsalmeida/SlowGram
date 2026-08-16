package com.slowgram.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.Toast

/**
 * "Configurações e privacidade": the About/privacy info lives HERE, reachable
 * from the small gear on the main screen — nothing floats over the feed.
 */
class SettingsActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        findViewById<Button>(R.id.settings_github_button).setOnClickListener {
            val url = getString(R.string.github_repo_url)
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            } catch (e: ActivityNotFoundException) {
                Toast.makeText(this, R.string.about_no_browser, Toast.LENGTH_SHORT).show()
            }
        }
    }
}
