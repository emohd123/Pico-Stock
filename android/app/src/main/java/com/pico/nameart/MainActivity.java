package com.pico.nameart;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceResponse;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;

import androidx.webkit.WebViewAssetLoader;

import java.io.OutputStream;

/**
 * Kiosk shell for the Name Art booth.
 *
 * The booth runs entirely from bundled assets, so it works with no network at all: the
 * poster is rendered on the device and written to shared storage, where the LED screen's
 * Huidu app can pick it up. The shell exists to give an unattended tablet what a browser
 * tab cannot: a screen that never sleeps, no browser chrome to wander out of, a back
 * button that does nothing, and a way to save a file.
 */
public class MainActivity extends Activity {
    private static final String PREFS = "name-art-kiosk";
    private static final String KEY_URL = "url";
    // Served through WebViewAssetLoader: a real https origin, so the canvas is not tainted
    // by file:// assets and toDataURL() works. Still entirely local - nothing leaves the device.
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String OFFLINE_URL =
            "https://" + ASSET_HOST + "/assets/booth/index.html";

    /** Volume-Down this many times in a row opens the operator dialog. */
    private static final int UNLOCK_PRESSES = 5;
    private static final long UNLOCK_WINDOW_MS = 3000;

    private WebView web;
    private WebViewAssetLoader assetLoader;
    private int presses;
    private long firstPressAt;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        // WebView has no navigator.wakeLock, so the shell holds the screen awake instead.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        // A remote booth keeps its pairing token in localStorage.
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        s.setTextZoom(100);

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                // Anything outside the booth is refused rather than opened.
                return !inBooth(request.getUrl().toString());
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidBooth");

        setContentView(web);
        web.loadUrl(boothUrl());
    }

    /** Exposed to the booth page as window.AndroidBooth. */
    private class Bridge {
        /**
         * Writes a rendered poster into Pictures/NameArt so the Huidu app can push it to
         * the LED screen. Returns the saved path, or an empty string if it could not be written.
         */
        @JavascriptInterface
        public String savePoster(String dataUrl, String fileName) {
            try {
                int comma = dataUrl.indexOf(',');
                if (comma < 0) return "";
                byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);

                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                values.put(MediaStore.Images.Media.RELATIVE_PATH,
                        Environment.DIRECTORY_PICTURES + "/NameArt");

                Uri target = getContentResolver()
                        .insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (target == null) return "";
                try (OutputStream out = getContentResolver().openOutputStream(target)) {
                    if (out == null) return "";
                    out.write(bytes);
                }
                return "Pictures/NameArt/" + fileName;
            } catch (Exception error) {
                return "";
            }
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        web.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    /** A guest must not be able to reverse out of the booth. */
    @Override
    public void onBackPressed() {
        // Intentionally empty.
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            long now = System.currentTimeMillis();
            if (now - firstPressAt > UNLOCK_WINDOW_MS) {
                firstPressAt = now;
                presses = 0;
            }
            if (++presses >= UNLOCK_PRESSES) {
                presses = 0;
                showOperatorDialog();
            }
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private String boothUrl() {
        return prefs().getString(KEY_URL, OFFLINE_URL);
    }

    private boolean inBooth(String url) {
        String current = boothUrl();
        if (Uri.parse(url).getHost() != null && ASSET_HOST.equals(Uri.parse(url).getHost())) return true;
        Uri a = Uri.parse(url), b = Uri.parse(current);
        return a.getScheme() != null && a.getScheme().equals(b.getScheme())
                && a.getAuthority() != null && a.getAuthority().equals(b.getAuthority());
    }

    private void showOperatorDialog() {
        final EditText field = new EditText(this);
        field.setSingleLine(true);
        field.setText(boothUrl());
        field.setSelectAllOnFocus(true);

        new AlertDialog.Builder(this)
                .setTitle("Booth address")
                .setMessage("Offline booth: " + OFFLINE_URL
                        + "\nOnline booth ends in /name-art/tablet.")
                .setView(field)
                .setPositiveButton("Save and reload", (d, w) -> {
                    String next = field.getText().toString().trim();
                    if (!next.isEmpty()) prefs().edit().putString(KEY_URL, next).apply();
                    web.loadUrl(boothUrl());
                })
                .setNeutralButton("Offline booth", (d, w) -> {
                    prefs().edit().putString(KEY_URL, OFFLINE_URL).apply();
                    web.loadUrl(OFFLINE_URL);
                })
                .setNegativeButton("Cancel", null)
                .show();
    }
}
