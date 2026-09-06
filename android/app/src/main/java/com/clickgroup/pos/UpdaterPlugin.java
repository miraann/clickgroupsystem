package com.clickgroup.pos;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * In-app self-update for the sideloaded APK flavors.
 *
 * The web layer (src/lib/appUpdate.ts) fetches an `android-latest.json` GitHub
 * release asset, compares versionCode against getCurrentVersion(), and — if newer
 * — calls downloadAndInstall({ url }) which streams the APK down (emitting
 * `progress` events) and hands it to the OS package installer.
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void getCurrentVersion(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? info.getLongVersionCode()
                : (long) info.versionCode;

            JSObject result = new JSObject();
            result.put("versionName", info.versionName);
            result.put("versionCode", code);
            result.put("packageName", getContext().getPackageName());
            call.resolve(result);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "Could not read app version");
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        final String url = call.getString("url", "");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        // Android O+: the user must allow this app to install packages. Send them
        // to the system screen and let the JS layer show a "grant then retry" hint.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent perm = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
                perm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(perm);
            } catch (Exception ignored) { /* fall through to the reject below */ }
            call.reject("Install permission required — allow 'Install unknown apps', then retry");
            return;
        }

        executor.submit(() -> {
            HttpURLConnection conn = null;
            try {
                File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) {
                    call.reject("No writable storage for the update");
                    return;
                }
                if (!dir.exists()) dir.mkdirs();
                File apk = new File(dir, "update.apk");
                if (apk.exists()) apk.delete();

                conn = (HttpURLConnection) URI.create(url).toURL().openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                conn.setInstanceFollowRedirects(true);
                conn.connect();

                int status = conn.getResponseCode();
                if (status < 200 || status >= 300) {
                    call.reject("Download failed (HTTP " + status + ")");
                    return;
                }

                long total = conn.getContentLengthLong();   // API 24+
                long done = 0;
                int lastPct = -1;

                try (InputStream in = conn.getInputStream();
                     OutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[8192];
                    int read;
                    while ((read = in.read(buf)) != -1) {
                        out.write(buf, 0, read);
                        done += read;
                        if (total > 0) {
                            int pct = (int) (done * 100 / total);
                            if (pct != lastPct) {
                                lastPct = pct;
                                JSObject ev = new JSObject();
                                ev.put("percent", pct);
                                notifyListeners("progress", ev);
                            }
                        }
                    }
                    out.flush();
                }

                Uri apkUri = FileProvider.getUriForFile(
                    getContext(), getContext().getPackageName() + ".fileprovider", apk);

                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(apkUri, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getContext().startActivity(install);

                JSObject result = new JSObject();
                result.put("ok", true);
                call.resolve(result);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Update download failed");
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }
}
