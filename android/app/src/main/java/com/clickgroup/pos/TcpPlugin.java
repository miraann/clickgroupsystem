package com.clickgroup.pos;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

@CapacitorPlugin(name = "TcpPlugin")
public class TcpPlugin extends Plugin {

    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    // ── TCP / IP printer ──────────────────────────────────────────────────────

    @PluginMethod
    public void printBytes(PluginCall call) {
        String host = call.getString("host", "");
        int port    = call.getInt("port", 9100);
        String data = call.getString("data", "");

        if (host == null || host.isEmpty() || data == null || data.isEmpty()) {
            call.reject("host and data are required");
            return;
        }

        final String finalHost = host;
        final int finalPort = port;
        final String finalData = data;

        getBridge().getExecutorService().submit(() -> {
            Socket socket = null;
            try {
                byte[] bytes = android.util.Base64.decode(finalData, android.util.Base64.DEFAULT);
                socket = new Socket();
                socket.connect(new InetSocketAddress(finalHost, finalPort), 5000);
                OutputStream out = socket.getOutputStream();
                out.write(bytes);
                out.flush();
                socket.close();
                socket = null;
                JSObject result = new JSObject();
                result.put("ok", true);
                call.resolve(result);
            } catch (Exception e) {
                if (socket != null) { try { socket.close(); } catch (Exception ignored) {} }
                call.reject(e.getMessage() != null ? e.getMessage() : "TCP connection failed");
            }
        });
    }

    // ── Network / IP scan ─────────────────────────────────────────────────────

    @PluginMethod
    public void getSubnet(PluginCall call) {
        String deviceIp = "";
        String subnet = "192.168.1";

        // Try WifiManager first (fastest)
        try {
            WifiManager wm = (WifiManager)
                getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                int ipInt = wm.getConnectionInfo().getIpAddress();
                if (ipInt != 0) {
                    deviceIp = String.format("%d.%d.%d.%d",
                        (ipInt & 0xff),
                        (ipInt >> 8) & 0xff,
                        (ipInt >> 16) & 0xff,
                        (ipInt >> 24) & 0xff);
                    subnet = deviceIp.substring(0, deviceIp.lastIndexOf('.'));
                }
            }
        } catch (Exception ignored) {}

        // Fallback: enumerate NetworkInterface
        if (deviceIp.isEmpty()) {
            try {
                Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
                while (interfaces != null && interfaces.hasMoreElements()) {
                    NetworkInterface iface = interfaces.nextElement();
                    if (iface.isLoopback() || !iface.isUp()) continue;
                    Enumeration<InetAddress> addrs = iface.getInetAddresses();
                    while (addrs.hasMoreElements()) {
                        InetAddress addr = addrs.nextElement();
                        if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                            deviceIp = addr.getHostAddress();
                            subnet = deviceIp.substring(0, deviceIp.lastIndexOf('.'));
                        }
                    }
                }
            } catch (Exception ignored) {}
        }

        JSObject result = new JSObject();
        result.put("ip", deviceIp);
        result.put("subnet", subnet);
        call.resolve(result);
    }

    @PluginMethod
    public void scanNetwork(PluginCall call) {
        String subnet  = call.getString("subnet", "192.168.1");
        int port       = call.getInt("port", 9100);
        int timeout    = call.getInt("timeout", 300);

        final String fs = subnet;
        final int fp    = port;
        final int ft    = timeout;

        getBridge().getExecutorService().submit(() -> {
            List<String> found = Collections.synchronizedList(new ArrayList<>());
            ExecutorService pool = Executors.newFixedThreadPool(50);
            List<Future<?>> futures = new ArrayList<>();

            for (int i = 1; i <= 254; i++) {
                final String ip = fs + "." + i;
                futures.add(pool.submit(() -> {
                    try {
                        Socket s = new Socket();
                        s.connect(new InetSocketAddress(ip, fp), ft);
                        s.close();
                        found.add(ip);
                    } catch (Exception ignored) {}
                }));
            }
            for (Future<?> f : futures) {
                try { f.get(); } catch (Exception ignored) {}
            }
            pool.shutdown();

            JSArray devices = new JSArray();
            for (String ip : found) {
                JSObject dev = new JSObject();
                dev.put("ip", ip);
                dev.put("port", fp);
                dev.put("name", "Printer @ " + ip);
                devices.put(dev);
            }
            JSObject result = new JSObject();
            result.put("devices", devices);
            call.resolve(result);
        });
    }

    // ── Bluetooth SPP printer ─────────────────────────────────────────────────

    @PluginMethod
    public void getBluetoothDevices(PluginCall call) {
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            JSArray devices = new JSArray();
            if (adapter != null && adapter.isEnabled()) {
                Set<BluetoothDevice> bonded = adapter.getBondedDevices();
                if (bonded != null) {
                    for (BluetoothDevice dev : bonded) {
                        JSObject d = new JSObject();
                        d.put("name", dev.getName() != null ? dev.getName() : "Unknown Device");
                        d.put("address", dev.getAddress());
                        devices.put(d);
                    }
                }
            }
            JSObject result = new JSObject();
            result.put("devices", devices);
            call.resolve(result);
        } catch (SecurityException e) {
            // Permission not granted — caller should show a message
            JSObject result = new JSObject();
            result.put("devices", new JSArray());
            result.put("permissionDenied", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "Failed to list Bluetooth devices");
        }
    }

    @PluginMethod
    public void printBluetooth(PluginCall call) {
        String address = call.getString("address", "");
        String data    = call.getString("data", "");

        if (address == null || address.isEmpty() || data == null || data.isEmpty()) {
            call.reject("address and data are required");
            return;
        }

        final String finalAddr = address.toUpperCase();
        final String finalData = data;

        getBridge().getExecutorService().submit(() -> {
            BluetoothSocket socket = null;
            try {
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null || !adapter.isEnabled()) {
                    call.reject("Bluetooth is not available or not enabled");
                    return;
                }
                adapter.cancelDiscovery();
                BluetoothDevice device = adapter.getRemoteDevice(finalAddr);
                socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                socket.connect();

                byte[] bytes = android.util.Base64.decode(finalData, android.util.Base64.DEFAULT);
                OutputStream out = socket.getOutputStream();
                out.write(bytes);
                out.flush();
                socket.close();
                socket = null;

                JSObject result = new JSObject();
                result.put("ok", true);
                call.resolve(result);
            } catch (SecurityException e) {
                if (socket != null) { try { socket.close(); } catch (Exception ignored) {} }
                call.reject("Bluetooth permission denied — enable in Android Settings → Apps → ClickGroup → Permissions");
            } catch (Exception e) {
                if (socket != null) { try { socket.close(); } catch (Exception ignored) {} }
                call.reject(e.getMessage() != null ? e.getMessage() : "Bluetooth print failed");
            }
        });
    }
}
