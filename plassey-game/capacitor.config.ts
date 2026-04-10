import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.plassey.game',
  appName: 'Battle of Plassey',
  webDir: 'dist',
  server: {
    androidScheme: 'http'
  }
};

export default config;
