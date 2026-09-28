import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.clickgroup.pos',
  appName: 'ClickGroup POS',
  webDir: 'public',
  server: {
    url: 'https://clickgroupsystem.vercel.app/dashboard',
    cleartext: false,
  },
  android: {
    backgroundColor: '#022658',
    // Marks the native shell for the web app (src/lib/nativeShell.ts). The
    // delivery / kds flavors carry their own kiosk markers instead.
    appendUserAgent: 'ClickGroupApp',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    // The app is dark: light status / navigation bar icons.
    SystemBars: {
      style: 'DARK',
    },
  },
};

export default config;
