package com.clickgroup.pos;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String APP_BASE  = "https://clickgroupsystem.vercel.app";
    private static final String PREFS     = "clickgroup_login";
    private static final String KEY_SLUG  = "restaurant_slug";
    // Only the cashier flavor keeps the com.clickgroup.pos applicationId (no
    // suffix). driver / seller / cfd each carry their own boot URL in their
    // flavor capacitor.config.json and must NOT be redirected to the POS PIN
    // screen, so the slug-binding logic below is cashier-only.
    private static final String CASHIER_PACKAGE = "com.clickgroup.pos";
    private static final String CFD_PACKAGE     = "com.clickgroup.pos.cfd";
    // Web sets this in localStorage from the CFD "Keep screen awake" toggle.
    private static final String KEY_KEEP_AWAKE  = "cfd_keep_awake";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;

    private boolean isCashierFlavor() {
        return CASHIER_PACKAGE.equals(getPackageName());
    }

    private boolean isCfdFlavor() {
        return CFD_PACKAGE.equals(getPackageName());
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(TcpPlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannel();

        if (isCfdFlavor()) {
            // Customer-facing display: hold the screen on by default. The web
            // "Keep screen awake" toggle (localStorage cfd_keep_awake) can clear
            // it; syncKeepAwake keeps the window flag in step with that value —
            // a fallback for WebViews without the JS Wake Lock API.
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            handler.postDelayed(this::syncKeepAwake, 4000);
            return;
        }

        if (!isCashierFlavor()) {
            // driver / seller: just load the flavor's configured URL.
            return;
        }

        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        // If this device already logged in once, open straight on the staff PIN
        // screen instead of the first-time restaurant (email) login. The saved
        // slug lives in SharedPreferences, so it survives app restarts / updates
        // and is only cleared on uninstall or "Change restaurant account".
        String savedSlug = prefs.getString(KEY_SLUG, null);
        if (savedSlug != null && !savedSlug.isEmpty()) {
            final String target = APP_BASE + "/pos/" + savedSlug + "/login";
            WebView wv = bridge.getWebView();
            wv.post(() -> wv.loadUrl(target));
        }

        // Keep the saved slug in sync with the web app's localStorage.
        handler.postDelayed(this::syncSlug, 3000);
    }

    private void syncSlug() {
        WebView wv = bridge.getWebView();
        if (wv != null) {
            String url = wv.getUrl();
            if (url != null && url.contains("/restaurant-login")) {
                // User deliberately went back to the email login — forget the binding.
                prefs.edit().remove(KEY_SLUG).apply();
            } else {
                wv.evaluateJavascript("localStorage.getItem('restaurant_slug')", value -> {
                    if (value != null && !value.equals("null")) {
                        String slug = value.replace("\"", "").trim();
                        if (!slug.isEmpty()) {
                            prefs.edit().putString(KEY_SLUG, slug).apply();
                        }
                    }
                });
            }
        }
        handler.postDelayed(this::syncSlug, 5000);
    }

    private void syncKeepAwake() {
        WebView wv = bridge.getWebView();
        if (wv != null) {
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
        handler.postDelayed(this::syncKeepAwake, 5000);
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
