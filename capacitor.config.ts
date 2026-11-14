import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aaptha.care',
  appName: 'Aaptha Care',
  webDir: 'www',
  android: {
    useLegacyBridge: true,
  },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: true,
      iosIsEncryption: true,
      iosDatabaseLocation: 'Library/CapacitorDatabase',
    },
    BackgroundGeolocation: {
      locationLogSqlite: true,
    },
  },
};

export default config;
