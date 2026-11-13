import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aaptha.care',
  appName: 'Aaptha Care',
  webDir: 'www',
  android: {
    useLegacyBridge: true,
  },
};

export default config;
