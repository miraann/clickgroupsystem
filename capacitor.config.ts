import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.clickgroup.pos',
  appName: 'ClickGroup POS',
  webDir: 'public',
  server: {
    url: 'https://clickgroupsystem.vercel.app/restaurant-login',
    cleartext: false,
  },
  android: {
    backgroundColor: '#022658',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
