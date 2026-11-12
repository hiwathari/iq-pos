package com.iqpos.till;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.text.InputType;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.Toast;

/**
 * The IQ POS Till as an Android app: a full-screen WebView on the platform, native receipt/kitchen
 * printing (PrintBridge), and — once chosen as the tablet's Home app — the screen the tablet boots
 * into and returns to on every Home press.
 *
 * Hidden admin menu: tap the top-left corner 5 times quickly, enter the admin code.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "iqpos";
    private static final String PREF_PIN = "admin_pin";
    private static final String PREF_KIOSK = "kiosk_lock";
    private static final int REQ_FILE = 41;
    private static final int REQ_CAMERA = 42;

    private WebView webView;
    private FrameLayout root;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingWebPermission;
    private int cornerTaps = 0;
    private long firstTapAt = 0;
    private boolean offlineShown = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_main);
        root = (FrameLayout) findViewById(R.id.root);
        webView = (WebView) findViewById(R.id.webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setAllowFileAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " IQPOSTill/2.0");

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        // The page looks for window.AndroidPrintBridge first (lib/local-print-bridge.ts).
        webView.addJavascriptInterface(new PrintBridge(), "AndroidPrintBridge");
        webView.addJavascriptInterface(new AppBridge(), "IQPOSApp");

        webView.setWebViewClient(new WebViewClient() {
            // Android 7+ calls this one…
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            // …Android 5–6 call this one.
            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(Uri.parse(url));
            }

            // Android 6+: only when the Till page itself can't load — not for a missing image or script.
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOffline(view);
            }

            // Android 5.
            @SuppressWarnings("deprecation")
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                if (failingUrl != null && failingUrl.startsWith("http")) showOffline(view);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (url != null && url.startsWith("http")) offlineShown = false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            // Camera for barcode scanning.
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                            pendingWebPermission = request;
                            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                        } else {
                            request.grant(request.getResources());
                        }
                    }
                });
            }

            // Photo upload (<input type=file>) — gallery or camera.
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }

            // The page's own Full screen button.
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                webView.setVisibility(View.GONE);
            }

            @Override
            public void onHideCustomView() {
                hideCustomView();
            }

            // The Till asks for confirmation before destructive actions (free all tables, void…).
            @Override
            public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                        .setOnCancelListener(d -> result.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                        .setNegativeButton(android.R.string.cancel, (d, w) -> result.cancel())
                        .setOnCancelListener(d -> result.cancel())
                        .show();
                return true;
            }
        });

        // Exports (CSV, PDF) open in the Downloads folder.
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
                if (!url.startsWith("http")) {
                    Toast.makeText(MainActivity.this, "This file can't be saved from here.", Toast.LENGTH_LONG).show();
                    return;
                }
                try {
                    DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                    req.setMimeType(mimeType);
                    req.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
                    req.addRequestHeader("User-Agent", userAgent);
                    req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    String name = android.webkit.URLUtil.guessFileName(url, contentDisposition, mimeType);
                    req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                    ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(req);
                    Toast.makeText(MainActivity.this, "Downloading " + name, Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Download failed.", Toast.LENGTH_LONG).show();
                }
            }
        });

        // Hidden corner: 5 taps within 3 seconds opens the admin menu.
        findViewById(R.id.adminCorner).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                long now = System.currentTimeMillis();
                if (now - firstTapAt > 3000) {
                    firstTapAt = now;
                    cornerTaps = 0;
                }
                cornerTaps++;
                if (cornerTaps >= 5) {
                    cornerTaps = 0;
                    askAdminCode();
                }
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            loadTill();
        }
    }

    // tel:, mailto:, maps… belong to other apps; web pages stay in the Till.
    private boolean handleUrl(Uri uri) {
        String scheme = uri.getScheme();
        if ("http".equals(scheme) || "https".equals(scheme) || "file".equals(scheme) || "about".equals(scheme)) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            // nothing installed that can open it
        }
        return true;
    }

    private void showOffline(WebView view) {
        if (offlineShown) return;
        offlineShown = true;
        view.loadUrl("file:///android_asset/offline.html");
    }

    private void hideCustomView() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        webView.setVisibility(View.VISIBLE);
        if (customViewCallback != null) customViewCallback.onCustomViewHidden();
    }

    private void loadTill() {
        offlineShown = false;
        webView.loadUrl(getString(R.string.pos_url));
    }

    // ---- full screen -------------------------------------------------------------------------

    private void hideSystemBars() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
        w.setStatusBarColor(Color.TRANSPARENT);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemBars();
        webView.onResume();
        // Back from the lock screen / another app with the Till showing the "can't reach" page: try again.
        if (offlineShown && isOnline()) loadTill();
        if (getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(PREF_KIOSK, false)) {
            try {
                startLockTask();
            } catch (Exception ignored) {
                // not allowed on this device right now
            }
        }
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    // Home pressed while the Till is the Home app (singleTask): the same Till comes back to the front.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        hideSystemBars();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    // As a Home app there is nowhere to go "back" to: Back steps back inside the Till, never out of it.
    @Override
    public void onBackPressed() {
        if (customView != null) {
            hideCustomView();
        } else if (webView.canGoBack() && !offlineShown) {
            webView.goBack();
        }
    }

    private boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo info = cm == null ? null : cm.getActiveNetworkInfo();
        return info != null && info.isConnected();
    }

    // ---- results -------------------------------------------------------------------------------

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_CAMERA && pendingWebPermission != null) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted) pendingWebPermission.grant(pendingWebPermission.getResources());
            else pendingWebPermission.deny();
            pendingWebPermission = null;
        }
    }

    // ---- hidden admin menu -------------------------------------------------------------------

    private String adminPin() {
        return getSharedPreferences(PREFS, MODE_PRIVATE).getString(PREF_PIN, getString(R.string.default_admin_pin));
    }

    private void askAdminCode() {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        input.setHint("Admin code");
        new AlertDialog.Builder(this)
                .setTitle("Admin")
                .setView(input)
                .setPositiveButton(android.R.string.ok, (d, w) -> {
                    if (input.getText().toString().equals(adminPin())) showAdminMenu();
                    else Toast.makeText(this, "Wrong code.", Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    private void showAdminMenu() {
        final boolean kiosk = getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(PREF_KIOSK, false);
        String[] items = {
                "Reload the Till",
                kiosk ? "Turn OFF screen lock (kiosk)" : "Turn ON screen lock (kiosk)",
                "Choose the Home app",
                "Android settings",
                "Change admin code",
        };
        new AlertDialog.Builder(this)
                .setTitle("IQ POS Till 2.0")
                .setItems(items, (d, which) -> {
                    switch (which) {
                        case 0:
                            loadTill();
                            break;
                        case 1:
                            setKiosk(!kiosk);
                            break;
                        case 2:
                            openSettings(Settings.ACTION_HOME_SETTINGS);
                            break;
                        case 3:
                            openSettings(Settings.ACTION_SETTINGS);
                            break;
                        case 4:
                            askNewCode();
                            break;
                        default:
                            break;
                    }
                })
                .show();
    }

    private void setKiosk(boolean on) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(PREF_KIOSK, on).apply();
        try {
            if (on) startLockTask();
            else stopLockTask();
            Toast.makeText(this, on ? "Screen lock on." : "Screen lock off.", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "Android didn't allow that.", Toast.LENGTH_LONG).show();
        }
    }

    private void openSettings(String action) {
        try {
            startActivity(new Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Not available on this device.", Toast.LENGTH_LONG).show();
        }
    }

    private void askNewCode() {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_NUMBER);
        input.setHint("New code (4–8 digits)");
        new AlertDialog.Builder(this)
                .setTitle("Change admin code")
                .setView(input)
                .setPositiveButton(android.R.string.ok, (d, w) -> {
                    String code = input.getText().toString();
                    if (code.length() >= 4 && code.length() <= 8) {
                        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(PREF_PIN, code).apply();
                        Toast.makeText(this, "Admin code changed.", Toast.LENGTH_SHORT).show();
                    } else {
                        Toast.makeText(this, "Use 4 to 8 digits.", Toast.LENGTH_SHORT).show();
                    }
                })
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    /** Small helpers for the offline page and the web app: window.IQPOSApp. */
    private class AppBridge {
        @JavascriptInterface
        public void reload() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (isOnline()) loadTill();
                }
            });
        }

        @JavascriptInterface
        public String version() {
            return "2.0";
        }
    }
}
