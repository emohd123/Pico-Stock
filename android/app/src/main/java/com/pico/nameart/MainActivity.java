package com.pico.nameart;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.text.InputType;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.webkit.WebViewAssetLoader;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;
import android.util.Log;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Kiosk shell for the Name Art booth.
 *
 * The booth runs entirely from bundled assets, so it works with no network at all: the poster
 * is rendered on the device, written to shared storage for the LED screen's Huidu app, and
 * served to guests over the tablet's own address behind a fixed QR code.
 */
public class MainActivity extends Activity {
    private static final String PREFS = "name-art-kiosk";
    private static final String KEY_URL = "url";
    private static final String KEY_PASSCODE = "passcode";
    private static final String DEFAULT_PASSCODE = "1155";

    // Served through WebViewAssetLoader: a real https origin, so the canvas is not tainted
    // by file:// assets and toDataURL() works. Still entirely local - nothing leaves the device.
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String OFFLINE_URL = "https://" + ASSET_HOST + "/assets/booth/index.html";

    /** Volume-Down this many times in a row asks for the passcode. */
    private static final int UNLOCK_PRESSES = 5;
    private static final long UNLOCK_WINDOW_MS = 3000;

    private WebView web;
    private WebViewAssetLoader assetLoader;
    /* Where the booth mirrors finished posters so a laptop on any network can display them.
       The code is the booth's permanent pairing code: a kiosk has to recover unattended. */
    private static final String CLOUD_ENDPOINT = "https://pico-stock.vercel.app/api/name-art/booth";
    private static final String CLOUD_CODE = "23157741";
    private static final String CLOUD_POSTER = "https://pico-stock.vercel.app/api/name-art/poster/";

    /* Where the booth's poster has got to on its way to the big screen. The booth page waits
       on this instead of guessing, so the QR appears when the name is actually on the wall
       rather than while the guest is still looking at a blank screen.
       off -> nothing in flight | uploading | waiting -> queued, not yet claimed
       shown -> the screen is displaying it | failed -> gave up, carry on regardless */
    private volatile String cloudState = "off";

    private final BoothServer server = new BoothServer();
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
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        // A kiosk layout must not move. Pinch and double-tap zoom are refused here as well as in
        // the page viewport, because a guest who zooms in has no way to get back out.
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(false);
        s.setLoadWithOverviewMode(false);

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                return !inBooth(request.getUrl().toString());
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidBooth");

        setContentView(web);
        server.setIdlePlate(readAsset("booth/img/idle.jpg"));
        server.start();
        web.loadUrl(boothUrl());
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Lock task mode is what actually stops a guest swiping the system bars into view;
        // immersive mode alone only hides them until the next swipe.
        try {
            ActivityManager manager = getSystemService(ActivityManager.class);
            if (manager != null
                    && manager.getLockTaskModeState() == ActivityManager.LOCK_TASK_MODE_NONE) {
                startLockTask();
            }
        } catch (Exception ignored) { }
    }

    @Override
    protected void onDestroy() {
        server.stop();
        super.onDestroy();
    }

    private static String readAll(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int read;
        while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
        return out.toString("UTF-8");
    }

    /** One string field out of a small JSON reply, without pulling in a parser. */
    private static String valueOf(String json, String key) {
        try { return new JSONObject(json).optString(key, ""); } catch (Exception error) { return ""; }
    }

    /** The National Day plate the poster screen rests on between guests. */
    private byte[] readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[16384];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            return out.toByteArray();
        } catch (Exception error) {
            return null;
        }
    }

    /** Exposed to the booth page as window.AndroidBooth. */
    private class Bridge {
        /**
         * Writes a rendered poster into Pictures/NameArt so the Huidu app can push it to the LED
         * screen, and publishes it behind the fixed guest QR. Returns the saved path, or "".
         */
        @JavascriptInterface
        public String savePoster(String dataUrl, String fileName) {
            try {
                int comma = dataUrl.indexOf(',');
                if (comma < 0) return "";
                byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);

                server.publish(bytes, fileName);

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

        /**
         * Publishes the finished poster to the website so a laptop anywhere can show it.
         *
         * The bytes already rendered on this tablet are what get uploaded - the server's own
         * renderer does not know about the calligraphy faces, so asking it to re-render would
         * put a different poster on the screen from the one in the guest's hands.
         *
         * Runs on its own thread and swallows every failure. The booth is offline-first: no
         * guest should ever wait on this, and a dead network must not cost them their poster.
         */
        @JavascriptInterface
        public void publishToCloud(final String dataUrl, final String name,
                                   final String background, final String requestId) {
            cloudState = "uploading";
            new Thread(new Runnable() {
                @Override public void run() {
                    HttpURLConnection connection = null;
                    try {
                        JSONObject payload = new JSONObject();
                        payload.put("code", CLOUD_CODE);
                        payload.put("name", name);
                        payload.put("background", background);
                        payload.put("requestId", requestId);
                        payload.put("image", dataUrl);

                        connection = (HttpURLConnection) new URL(CLOUD_ENDPOINT).openConnection();
                        connection.setRequestMethod("POST");
                        connection.setRequestProperty("Content-Type", "application/json");
                        connection.setConnectTimeout(8000);
                        connection.setReadTimeout(20000);
                        connection.setDoOutput(true);
                        byte[] out = payload.toString().getBytes("UTF-8");
                        connection.setFixedLengthStreamingMode(out.length);
                        try (OutputStream stream = connection.getOutputStream()) { stream.write(out); }
                        String reply = readAll(connection.getInputStream());
                        String share = valueOf(reply, "shareToken");
                        if (share.isEmpty()) { cloudState = "failed"; return; }

                        /* Now wait for the screen to actually claim it. The laptop polls the
                           site about once a second, so this is usually a second or two; the
                           cap exists so a screen that is switched off never strands a guest. */
                        cloudState = "waiting";
                        long until = System.currentTimeMillis() + 12000;
                        while (System.currentTimeMillis() < until) {
                            Thread.sleep(700);
                            HttpURLConnection look = null;
                            try {
                                look = (HttpURLConnection) new URL(CLOUD_POSTER + share).openConnection();
                                look.setConnectTimeout(5000);
                                look.setReadTimeout(8000);
                                String status = valueOf(readAll(look.getInputStream()), "status");
                                if ("showing".equals(status) || "displayed".equals(status)) {
                                    cloudState = "shown";
                                    return;
                                }
                            } catch (Exception ignored) {
                            } finally { if (look != null) look.disconnect(); }
                        }
                        cloudState = "failed";
                    } catch (Exception error) {
                        cloudState = "failed";
                        Log.i("NameArt", "cloud publish skipped: " + error.getMessage());
                    } finally {
                        if (connection != null) connection.disconnect();
                    }
                }
            }, "cloud-publish").start();
        }

        /** Where the poster has got to on its way to the screen; see cloudState. */
        @JavascriptInterface
        public String cloudState() { return cloudState; }

        /** Finish returns the poster screen to the idle plate for the next guest. */
        @JavascriptInterface
        public void clearScreen() {
            server.clearPoster();
        }

        /** The fixed address behind the guest QR, or "" when the tablet is on no network. */
        @JavascriptInterface
        public String boothAddress() {
            return BoothServer.address();
        }

        /** A QR encoded on the device, returned as a PNG data URL. */
        @JavascriptInterface
        public String qrDataUrl(String text, int size) {
            try {
                Map<EncodeHintType, Object> hints = new HashMap<>();
                hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);
                hints.put(EncodeHintType.MARGIN, 2);
                hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");

                BitMatrix matrix = new QRCodeWriter()
                        .encode(text, BarcodeFormat.QR_CODE, size, size, hints);

                int w = matrix.getWidth(), h = matrix.getHeight();
                int[] pixels = new int[w * h];
                for (int y = 0; y < h; y++) {
                    for (int x = 0; x < w; x++) {
                        pixels[y * w + x] = matrix.get(x, y) ? 0xFF123C2C : 0xFFFFFFFF;
                    }
                }
                Bitmap bitmap = Bitmap.createBitmap(pixels, w, h, Bitmap.Config.ARGB_8888);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
                return "data:image/png;base64,"
                        + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
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
                askPasscode();
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

    private String passcode() {
        return prefs().getString(KEY_PASSCODE, DEFAULT_PASSCODE);
    }

    private boolean inBooth(String url) {
        String host = Uri.parse(url).getHost();
        if (host != null && ASSET_HOST.equals(host)) return true;
        Uri a = Uri.parse(url), b = Uri.parse(boothUrl());
        return a.getScheme() != null && a.getScheme().equals(b.getScheme())
                && a.getAuthority() != null && a.getAuthority().equals(b.getAuthority());
    }

    private void askPasscode() {
        final EditText field = new EditText(this);
        field.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        field.setHint("Passcode");

        new AlertDialog.Builder(this)
                .setTitle("Operator")
                .setView(field)
                .setPositiveButton("Unlock", (d, w) -> {
                    if (passcode().equals(field.getText().toString().trim())) showOperatorDialog();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private TextView label(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        int gap = (int) (12 * getResources().getDisplayMetrics().density);
        view.setPadding(0, gap, 0, 0);
        return view;
    }

    private void showOperatorDialog() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (18 * getResources().getDisplayMetrics().density);
        box.setPadding(pad, pad, pad, pad);

        TextView guest = new TextView(this);
        String address = BoothServer.address();
        guest.setText("Guest QR address:\n" + (address.isEmpty() ? "no network" : address)
                + "\n\nPrint this address as a QR to use one fixed code at the booth.");
        box.addView(guest);

        box.addView(label("Booth address"));
        final EditText urlField = new EditText(this);
        urlField.setSingleLine(true);
        urlField.setText(boothUrl());
        box.addView(urlField);

        box.addView(label("Operator passcode"));
        final EditText codeField = new EditText(this);
        codeField.setSingleLine(true);
        codeField.setInputType(InputType.TYPE_CLASS_NUMBER);
        codeField.setText(passcode());
        box.addView(codeField);

        new AlertDialog.Builder(this)
                .setTitle("Booth settings")
                .setView(box)
                .setPositiveButton("Save and reload", (d, w) -> {
                    String url = urlField.getText().toString().trim();
                    String code = codeField.getText().toString().trim();
                    SharedPreferences.Editor edit = prefs().edit();
                    if (!url.isEmpty()) edit.putString(KEY_URL, url);
                    if (!code.isEmpty()) edit.putString(KEY_PASSCODE, code);
                    edit.apply();
                    web.loadUrl(boothUrl());
                })
                .setNeutralButton("Leave kiosk", (d, w) -> {
                    try { stopLockTask(); } catch (Exception ignored) { }
                })
                .setNegativeButton("Cancel", null)
                .show();
    }
}
