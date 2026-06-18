import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.splitr.app',
  appName: 'Splitr',
  webDir: 'dist',
  backgroundColor: '#0f1020',
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#0f1020',
      androidSplashResourceName: 'splash',
      showSpinner: false
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#4338ca'
    }
  }
};

export default config;
