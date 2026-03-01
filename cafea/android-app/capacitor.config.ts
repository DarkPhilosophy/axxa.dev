import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.axxa.cafea',
  appName: 'Cafea AXXA',
  webDir: 'web-build',
  server: {
    androidScheme: 'https'
  }
};

export default config;
