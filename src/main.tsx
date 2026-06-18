import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { AuthProvider } from '@/context/AuthProvider';
import App from './App';
import './index.css';

const isNative = Capacitor.isNativePlatform();

// On web we keep clean URLs; inside the native WebView a hash router avoids
// any file-path / deep-link edge cases on reload.
const Router = isNative ? HashRouter : BrowserRouter;

// Native-only chrome (status bar + splash). Imported lazily so the web build stays lean.
if (isNative) {
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#4338ca' }).catch(() => {});
  });
  import('@capacitor/splash-screen').then(({ SplashScreen }) => {
    SplashScreen.hide().catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Router>
  </React.StrictMode>
);
