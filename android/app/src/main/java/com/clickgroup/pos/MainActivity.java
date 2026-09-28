package com.clickgroup.pos;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.ColorUtils;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.CapConfig;
import com.getcapacitor.WebViewListener;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    private static final String APP_BASE  = "https://clickgroupsystem.vercel.app";
    private static final String PREFS     = "clickgroup_login";
    private static final String KEY_SLUG  = "restaurant_slug";
    // The cashier flavor keeps the com.clickgroup.pos applicationId (no suffix);
    // delivery is com.clickgroup.pos.delivery, kds is com.clickgroup.pos.kds. All
    // three bind the restaurant slug to the device and boot straight to the staff
    // PIN screen on later launches (delivery/kds append their own ?next=). driver /
    // seller / cfd each carry their own boot URL in their flavor capacitor.config.json
    // and must NOT be redirected to the PIN screen.
    private static final String CASHIER_PACKAGE  = "com.clickgroup.pos";
    private static final String DRIVER_PACKAGE   = "com.clickgroup.pos.driver";
    private static final String DELIVERY_PACKAGE = "com.clickgroup.pos.delivery";
    private static final String SELLER_PACKAGE   = "com.clickgroup.pos.seller";
    private static final String CFD_PACKAGE      = "com.clickgroup.pos.cfd";
    private static final String KDS_PACKAGE      = "com.clickgroup.pos.kds";
    // Where the delivery / kds flavors send the user after a successful PIN.
    private static final String DELIVERY_NEXT    = "/dashboard/delivery-orders";
    private static final String KDS_NEXT         = "/dashboard/kds";
    // Web sets this in localStorage from the CFD "Keep screen awake" toggle.
    private static final String KEY_KEEP_AWAKE  = "cfd_keep_awake";

    // Bundled offline screen (android/app/src/main/assets), shown instead of
    // Chromium's "Webpage not available" when a page load fails for lack of network.
    private static final String OFFLINE_ASSET = "cg_offline.html";

    // Upper bound on how long the splash may wait for the web app's first paint.
    private static final long SPLASH_MAX_MS = 8000;

    // Hardware back: lets the page veto (preventDefault on `cg:backbutton`, e.g. to
    // close a modal) and otherwise reports the current path so we can decide
    // between web history and backgrounding the app.
    private static final String BACK_JS =
        "(function(){try{var e=new CustomEvent('cg:backbutton',{cancelable:true});" +
        "if(!window.dispatchEvent(e))return '__handled__';return location.pathname;}" +
        "catch(_){return '';}})()";

    // Renderer-crash loop guard (static: survives the recreate() it triggers).
    private static long lastRendererGoneAt = 0;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private volatile boolean webReady = false;
    private boolean rendererGone = false;
    private boolean syncing = false;
    private Integer barColor = null;

    private final Runnable slugTick = new Runnable() {
        @Override
        public void run() {
            syncSlug();
            handler.postDelayed(this, 5000);
        }
    };

    private final Runnable keepAwakeTick = new Runnable() {
        @Override
        public void run() {
            syncKeepAwake();
            handler.postDelayed(this, 5000);
        }
    };

    private boolean isCashierFlavor() {
        return CASHIER_PACKAGE.equals(getPackageName());
    }

    private boolean isDeliveryFlavor() {
        return DELIVERY_PACKAGE.equals(getPackageName());
    }

    private boolean isCfdFlavor() {
        return CFD_PACKAGE.equals(getPackageName());
    }

    private boolean isKdsFlavor() {
        return KDS_PACKAGE.equals(getPackageName());
    }

    /** cashier / delivery / kds remember the restaurant slug and boot to its PIN screen. */
    private boolean usesSlugBinding() {
        return isCashierFlavor() || isDeliveryFlavor() || isKdsFlavor();
    }

    /** The flavor's main screen — hardware Back there sends the app to the background. */
    private String flavorHome() {
        String pkg = getPackageName();
        if (DRIVER_PACKAGE.equals(pkg)) return "/dashboard/driver";
        if (DELIVERY_PACKAGE.equals(pkg)) return DELIVERY_NEXT;
        if (KDS_PACKAGE.equals(pkg)) return KDS_NEXT;
        if (SELLER_PACKAGE.equals(pkg)) return "/seller";
        if (CFD_PACKAGE.equals(pkg)) return "/cfd";
        return "/dashboard";
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Branded splash (navy + this flavor's icon) held until the web app has
        // painted, so launch goes splash → finished screen with no blank/white frame.
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(() -> !webReady);
        splash.setOnExitAnimationListener(provider -> {
            View v = provider.getView();
            v.animate().alpha(0f).setDuration(220).withEndAction(provider::remove).start();
        });
        handler.postDelayed(this::markWebReady, SPLASH_MAX_MS);

        registerPlugin(TcpPlugin.class);
        registerPlugin(UpdaterPlugin.class);

        if (usesSlugBinding()) {
            prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

            // If this device already logged in once, boot straight to the staff PIN
            // screen instead of the first-time restaurant (email) login. Swapping
            // the start URL into the bridge config (rather than loading the default
            // URL and then redirecting) saves a whole page load on every launch.
            // The saved slug lives in SharedPreferences, so it survives app
            // restarts / updates and is only cleared on uninstall or "Change
            // restaurant account".
            String bootUrl = savedSlugBootUrl();
            if (bootUrl != null) {
                CapConfig bootConfig = configWithServerUrl(bootUrl);
                if (bootConfig != null) config = bootConfig;
            }
        }

        super.onCreate(savedInstanceState);
        if (bridge == null) {
            // No usable system WebView — BridgeActivity showed its fallback layout.
            markWebReady();
            return;
        }

        createNotificationChannel();
        tuneWebView();
        installBackHandler();
        bridge.setWebViewClient(new ShellWebViewClient(bridge));
        bridge.addWebViewListener(new ShellListener());

        if (isCfdFlavor()) {
            // Customer-facing display: hold the screen on by default. The web
            // "Keep screen awake" toggle (localStorage cfd_keep_awake) can clear
            // it; syncKeepAwake keeps the window flag in step with that value —
            // a fallback for WebViews without the JS Wake Lock API.
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    private String savedSlugBootUrl() {
        String savedSlug = prefs.getString(KEY_SLUG, null);
        if (savedSlug == null || savedSlug.isEmpty()) return null;
        String url = APP_BASE + "/pos/" + Uri.encode(savedSlug) + "/login";
        if (isDeliveryFlavor()) {
            // Land on the delivery-orders screen once the PIN is accepted.
            url += "?next=" + Uri.encode(DELIVERY_NEXT);
        } else if (isKdsFlavor()) {
            // Land on the kitchen display screen once the PIN is accepted.
            url += "?next=" + Uri.encode(KDS_NEXT);
        }
        return url;
    }

    /** This flavor's capacitor.config.json with server.url replaced by {@code url}. */
    private CapConfig configWithServerUrl(String url) {
        try {
            JSONObject json = new JSONObject(readAsset("capacitor.config.json"));
            JSONObject server = json.optJSONObject("server");
            if (server == null) {
                server = new JSONObject();
                json.put("server", server);
            }
            server.put("url", url);
            File dir = new File(getCacheDir(), "boot-config");
            if (!dir.isDirectory() && !dir.mkdirs()) return null;
            try (OutputStream out = new FileOutputStream(new File(dir, "capacitor.config.json"))) {
                out.write(json.toString().getBytes(StandardCharsets.UTF_8));
            }
            return CapConfig.loadFromFile(this, dir.getAbsolutePath());
        } catch (Exception e) {
            // Fall back to the flavor's default boot URL; the web app redirects from there.
            return null;
        }
    }

    private void tuneWebView() {
        WebView wv = bridge.getWebView();
        WebSettings s = wv.getSettings();
        // POS screens are laid out at 100%; don't let the system font-size
        // setting reflow them.
        s.setTextZoom(100);
        // Raster the tiles just outside the viewport ahead of time: smoother
        // scrolling and transitions for a little extra memory.
        s.setOffscreenPreRaster(true);
        // No edge glow / stretch on the page itself — screens scroll inside
        // their own containers, like a native layout.
        wv.setOverScrollMode(View.OVER_SCROLL_NEVER);
        wv.addJavascriptInterface(new NativeShellBridge(), "ClickGroupNative");
    }

    private void markWebReady() {
        webReady = true;
    }

    /** The bridge WebView, or null once its renderer is gone (it must not be touched then). */
    private WebView liveWebView() {
        if (bridge == null || rendererGone) return null;
        return bridge.getWebView();
    }

    // ── Hardware back ────────────────────────────────────────────────────────

    private void installBackHandler() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                onHardwareBack();
            }
        });
    }

    // Native back semantics: step back through in-app history, but on a main
    // screen (home, login, PIN) send the app to the background instead of
    // destroying it — reopening is then instant, with the session intact.
    private void onHardwareBack() {
        WebView wv = liveWebView();
        if (wv == null) {
            moveTaskToBack(true);
            return;
        }
        wv.evaluateJavascript(BACK_JS, value -> {
            String path = unquote(value);
            if ("__handled__".equals(path)) return;
            if (isRootPath(path) || !wv.canGoBack()) {
                moveTaskToBack(true);
            } else {
                wv.goBack();
            }
        });
    }

    private boolean isRootPath(String path) {
        if (path == null || path.isEmpty() || path.equals("/")) return true;
        if (path.startsWith("/restaurant-login") || path.equals("/seller-login") || path.equals("/pos")) return true;
        if (path.startsWith("/pos/") && path.endsWith("/login")) return true;
        if (isCfdFlavor() && path.startsWith("/cfd")) return true;
        String home = flavorHome();
        return path.equals(home) || path.equals(home + "/");
    }

    private static String unquote(String jsValue) {
        if (jsValue == null || jsValue.equals("null")) return null;
        if (jsValue.length() >= 2 && jsValue.startsWith("\"") && jsValue.endsWith("\"")) {
            return jsValue.substring(1, jsValue.length() - 1);
        }
        return jsValue;
    }

    // ── Offline screen ───────────────────────────────────────────────────────

    private class ShellWebViewClient extends BridgeWebViewClient {

        ShellWebViewClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (request.isForMainFrame() && isNetworkFailure(error.getErrorCode())) {
                showOfflinePage(view, request.getUrl().toString());
            }
        }
    }

    private boolean isNetworkFailure(int errorCode) {
        switch (errorCode) {
            case WebViewClient.ERROR_HOST_LOOKUP:
            case WebViewClient.ERROR_CONNECT:
            case WebViewClient.ERROR_TIMEOUT:
            case WebViewClient.ERROR_IO:
            case WebViewClient.ERROR_FAILED_SSL_HANDSHAKE: // typically a Wi-Fi captive portal
                return true;
            case WebViewClient.ERROR_UNKNOWN:
                return !isOnline();
            default:
                return false;
        }
    }

    private boolean isOnline() {
        ConnectivityManager cm = getSystemService(ConnectivityManager.class);
        if (cm == null) return true;
        Network network = cm.getActiveNetwork();
        NetworkCapabilities caps = network != null ? cm.getNetworkCapabilities(network) : null;
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    // Loaded on the app origin so the page can read the UI language from
    // localStorage and probe the server; it returns to failedUrl once online.
    private void showOfflinePage(WebView view, String failedUrl) {
        if (failedUrl == null || !failedUrl.startsWith(APP_BASE)) return;
        String html = readAsset(OFFLINE_ASSET);
        if (html == null) return;
        String bg = String.format(Locale.US, "#%06X", 0xFFFFFF & getColor(R.color.cg_app_bg));
        html = html.replace("__CG_RETRY_URL__", JSONObject.quote(failedUrl)).replace("__CG_BG__", bg);
        view.loadDataWithBaseURL(APP_BASE + "/", html, "text/html", "UTF-8", null);
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (Exception e) {
            return null;
        }
    }

    // ── Page lifecycle ───────────────────────────────────────────────────────

    private class ShellListener extends WebViewListener {

        @Override
        public void onPageStarted(WebView view) {
            enforceKioskScope(view, view != null ? view.getUrl() : null);
        }

        @Override
        public void onPageCommitVisible(WebView view, String url) {
            enforceKioskScope(view, url);
        }

        @Override
        public void onPageLoaded(WebView view) {
            // Fallback for pages that never call ClickGroupNative.appReady().
            markWebReady();
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // The renderer died — usually the OS reclaiming memory while the app
            // sat in the background. Returning false would crash the whole app;
            // rebuild the activity (and a fresh WebView) instead. A second death
            // within 15 s means the page itself keeps killing it: just close.
            rendererGone = true;
            long now = SystemClock.elapsedRealtime();
            boolean crashLoop = lastRendererGoneAt != 0 && now - lastRendererGoneAt < 15000;
            lastRendererGoneAt = now;
            handler.post(() -> {
                if (crashLoop) finish();
                else recreate();
            });
            return true;
        }
    }

    private void enforceKioskScope(WebView view, String url) {
        if (isDeliveryFlavor()) {
            // Single-screen kiosk: the Delivery app may only show
            // /dashboard/delivery-orders. The web KioskGuard handles in-app (SPA)
            // navigation; this is the native backstop for full page loads.
            enforceScope(view, url, DELIVERY_NEXT);
        } else if (isKdsFlavor()) {
            // Single-screen kiosk: the KDS app may only show /dashboard/kds.
            enforceScope(view, url, KDS_NEXT);
        }
    }

    // Bounce any full-load navigation to another dashboard route back to the
    // kiosk's own screen. Login / PIN screens and the encoded ?next= query are
    // left alone.
    private void enforceScope(WebView view, String url, String home) {
        if (view == null || url == null || rendererGone) return;
        if (!url.contains("clickgroupsystem.vercel.app/dashboard")) return;
        if (url.contains(home)) return;
        view.post(() -> view.loadUrl(APP_BASE + home));
    }

    // ── JS ⇄ native ─────────────────────────────────────────────────────────

    /** Exposed to the web app as window.ClickGroupNative (see src/lib/nativeShell.ts). */
    private class NativeShellBridge {

        /** The web app has rendered its first screen — drop the splash. */
        @JavascriptInterface
        public void appReady() {
            markWebReady();
        }

        /** Paint the status / navigation bars to match the screen (a CSS colour). */
        @JavascriptInterface
        public void setSystemBarColor(String cssColor) {
            if (cssColor == null) return;
            final int color;
            try {
                color = Color.parseColor(cssColor.trim()) | 0xFF000000;
            } catch (IllegalArgumentException e) {
                return;
            }
            runOnUiThread(() -> applyBarColor(color));
        }
    }

    @SuppressWarnings("deprecation")
    private void applyBarColor(int color) {
        barColor = color;
        Window w = getWindow();
        // Android 15+ draws edge-to-edge: the bars are transparent over the
        // decor view, so its background is what shows behind them.
        w.getDecorView().setBackgroundColor(color);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            w.setStatusBarColor(color);
            w.setNavigationBarColor(color);
        }
        boolean lightBars = ColorUtils.calculateLuminance(color) > 0.5;
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(w, w.getDecorView());
        bars.setAppearanceLightStatusBars(lightBars);
        bars.setAppearanceLightNavigationBars(lightBars);
        WebView wv = liveWebView();
        if (wv != null) wv.setBackgroundColor(color);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // Capacitor's SystemBars resets the bars to the theme on rotation /
        // dark-mode change; restore the colour the web app asked for.
        if (barColor != null) applyBarColor(barColor);
    }

    // ── Background sync (only while in the foreground) ──────────────────────

    @Override
    public void onResume() {
        super.onResume();
        if (syncing) return;
        syncing = true;
        if (usesSlugBinding()) handler.postDelayed(slugTick, 3000);
        if (isCfdFlavor()) handler.postDelayed(keepAwakeTick, 4000);
    }

    @Override
    public void onPause() {
        handler.removeCallbacks(slugTick);
        handler.removeCallbacks(keepAwakeTick);
        syncing = false;
        // Capture the latest slug on the way out, not up to 5 s later.
        if (usesSlugBinding()) syncSlug();
        super.onPause();
    }

    // Keep the saved slug in sync with the web app's localStorage.
    private void syncSlug() {
        WebView wv = liveWebView();
        if (wv == null || prefs == null) return;
        String url = wv.getUrl();
        if (url != null && url.contains("/restaurant-login")) {
            // User deliberately went back to the email login — forget the binding.
            prefs.edit().remove(KEY_SLUG).apply();
            return;
        }
        wv.evaluateJavascript("localStorage.getItem('restaurant_slug')", value -> {
            if (value != null && !value.equals("null")) {
                String slug = value.replace("\"", "").trim();
                if (!slug.isEmpty()) {
                    prefs.edit().putString(KEY_SLUG, slug).apply();
                }
            }
        });
    }

    private void syncKeepAwake() {
        WebView wv = liveWebView();
        if (wv == null) return;
        wv.evaluateJavascript("localStorage.getItem('" + KEY_KEEP_AWAKE + "')", value -> {
            String v = value == null ? "" : value.replace("\"", "").trim();
            boolean keep = !v.equals("0") && !v.equalsIgnoreCase("false");
            if (keep) {
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        });
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null && nm.getNotificationChannel("pos_alerts") == null) {
                NotificationChannel channel = new NotificationChannel(
                    "pos_alerts",
                    "POS Alerts",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Delivery orders, waiter calls, and kitchen alerts");
                channel.enableVibration(true);
                channel.enableLights(true);
                nm.createNotificationChannel(channel);
            }
        }
    }
}
