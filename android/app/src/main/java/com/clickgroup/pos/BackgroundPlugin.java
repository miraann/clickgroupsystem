package com.clickgroup.pos;

import android.app.ActivityManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

/**
 * What keeps FCM alerts from reaching a backgrounded or swiped-away app, and
 * the system screens that fix each one (src/lib/backgroundDelivery.ts):
 *
 *  - battery optimization (Doze / App Standby) — high-priority FCM still wakes
 *    the app, but OEM skins lean on this flag to decide who they kill;
 *  - background restriction ("Restricted" battery use) — cuts the app off;
 *  - a muted pos_alerts channel or app notifications turned off;
 *  - OEM managers (Xiaomi auto-start, Huawei app launch, Oppo/Vivo background
 *    apps, Samsung sleeping apps) that force-stop the app on swipe-away. A
 *    force-stopped app gets no FCM messages at all until it's opened again.
 */
@CapacitorPlugin(name = "Background")
public class BackgroundPlugin extends Plugin {

    private static final String CHANNEL_ID = "pos_alerts";

    // OEM screens for auto-start / background running, most specific first.
    // Absent or non-exported ones just throw and the next is tried.
    private static final ComponentName[] OEM_SCREENS = {
        // Xiaomi / Redmi / POCO — Autostart
        new ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
        // Huawei (EMUI) — App launch
        new ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
        new ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"),
        // Honor (MagicOS)
        new ComponentName("com.hihonor.systemmanager", "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
        // Oppo / Realme / OnePlus (ColorOS)
        new ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
        new ComponentName("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"),
        new ComponentName("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"),
        new ComponentName("com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"),
        // Vivo / iQOO — Background apps
        new ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
        new ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager"),
        // Samsung — Battery (sleeping / deep sleeping apps)
        new ComponentName("com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity"),
        new ComponentName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"),
        new ComponentName("com.samsung.android.sm", "com.samsung.android.sm.battery.ui.BatteryActivity"),
        // Asus
        new ComponentName("com.asus.mobilemanager", "com.asus.mobilemanager.autostart.AutoStartActivity"),
    };

    private static final String[] OEM_BRANDS = {
        "xiaomi", "redmi", "poco", "huawei", "honor", "oppo", "realme", "oneplus",
        "vivo", "iqoo", "samsung", "asus", "meizu", "tecno", "infinix", "itel",
    };

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context ctx = getContext();
        JSObject result = new JSObject();
        result.put("batteryOptimized", !isIgnoringBatteryOptimizations());
        result.put("backgroundRestricted", isBackgroundRestricted());
        result.put("notificationsEnabled", NotificationManagerCompat.from(ctx).areNotificationsEnabled());
        result.put("channelEnabled", isChannelEnabled());
        result.put("manufacturer", Build.MANUFACTURER);
        result.put("hasOemManager", hasOemManager());
        call.resolve(result);
    }

    /**
     * Android's own "Let the app always run in the background?" dialog. Resolves
     * once it closes: it's a translucent activity, so the page behind it never
     * goes hidden and has no visibilitychange to re-read getStatus() on.
     */
    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        if (isIgnoringBatteryOptimizations()) {
            call.resolve();
            return;
        }
        Intent dialog = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            Uri.parse("package:" + getContext().getPackageName()));
        try {
            startActivityForResult(call, dialog, "batteryDialogClosed");
        } catch (Exception e) {
            // Some OEMs strip the dialog; the full list is the fallback.
            tryStart(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            call.resolve();
        }
    }

    @ActivityCallback
    private void batteryDialogClosed(PluginCall call, ActivityResult result) {
        if (call != null) call.resolve();
    }

    /** App info — battery use ("Unrestricted"), notifications, permissions. */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        tryStart(appDetailsIntent());
        call.resolve();
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Context ctx = getContext();
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && NotificationManagerCompat.from(ctx).areNotificationsEnabled()
                && !isChannelEnabled()) {
            intent = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName())
                .putExtra(Settings.EXTRA_CHANNEL_ID, CHANNEL_ID);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
        } else {
            intent = appDetailsIntent();
        }
        if (!tryStart(intent)) tryStart(appDetailsIntent());
        call.resolve();
    }

    /** The vendor's auto-start / background manager, or App info when there is none. */
    @PluginMethod
    public void openOemSettings(PluginCall call) {
        boolean opened = false;
        for (ComponentName screen : OEM_SCREENS) {
            if (tryStart(new Intent().setComponent(screen))) {
                opened = true;
                break;
            }
        }
        if (!opened) tryStart(appDetailsIntent());
        JSObject result = new JSObject();
        result.put("opened", opened);
        call.resolve(result);
    }

    private boolean isIgnoringBatteryOptimizations() {
        PowerManager pm = getContext().getSystemService(PowerManager.class);
        return pm == null || pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    private boolean isBackgroundRestricted() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false;
        ActivityManager am = getContext().getSystemService(ActivityManager.class);
        return am != null && am.isBackgroundRestricted();
    }

    private boolean isChannelEnabled() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        NotificationManager nm = getContext().getSystemService(NotificationManager.class);
        if (nm == null) return true;
        NotificationChannel channel = nm.getNotificationChannel(CHANNEL_ID);
        return channel != null && channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }

    private boolean hasOemManager() {
        String brand = (Build.MANUFACTURER + " " + Build.BRAND).toLowerCase(Locale.ROOT);
        for (String oem : OEM_BRANDS) {
            if (brand.contains(oem)) return true;
        }
        return false;
    }

    private Intent appDetailsIntent() {
        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:" + getContext().getPackageName()));
    }

    private boolean tryStart(Intent intent) {
        try {
            getActivity().startActivity(intent);
            return true;
        } catch (Exception e) {
            // ActivityNotFoundException / SecurityException (not exported).
            return false;
        }
    }
}
