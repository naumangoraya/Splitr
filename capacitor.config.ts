import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.splitr.app',
  appName: 'Splitr',
  webDir: 'dist',
  backgroundColor: '#0c0d10', // Eidosyne dark
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      backgroundColor: '#0c0d10', // Eidosyne dark
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
