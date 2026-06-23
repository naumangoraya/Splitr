import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { AuthProvider } from '@/context/AuthProvider';
import { initViewport } from '@/lib/viewport';
import App from './App';
import './index.css';

const isNative = Capacitor.isNativePlatform();

// Track the visible viewport height (so the keyboard pushes content up instead of
// covering the chat composer / bottom sheets). Must run before first paint.
initViewport();

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

const rootEl = document.getElementById('root')!;

// Last-resort fallback: if the app fails to start (e.g. an old WebView), show a
// readable message instead of a blank/crashed screen.
function showFatal(message: string) {
  rootEl.innerHTML =
    '<div style="min-height:100%;height:100%;overflow:auto;display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;gap:12px;padding:24px;background:#0c0d10;color:#fff;' +
    'font-family:system-ui,sans-serif;text-align:center">' +
    '<div style="font-size:22px;font-weight:800">Ei<span style="color:#22c55e">dosyne</span></div>' +
    '<p style="color:#9aa;font-size:14px;max-width:300px">Splitr couldn’t start on this device. ' +
    'Please update Android System WebView / Chrome from the Play Store, then reopen.</p>' +
    '<p style="color:#556;font-size:11px;max-width:320px;word-break:break-word">' + message + '</p>' +
    '</div>';
}

window.addEventListener('error', (e) => { if (!rootEl.hasChildNodes()) showFatal(String(e.message || e.error || 'Startup error')); });
window.addEventListener('unhandledrejection', (e) => { if (!rootEl.hasChildNodes()) showFatal(String((e.reason && e.reason.message) || e.reason || 'Startup error')); });

try {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <Router>
        <AuthProvider>
          <App />
        </AuthProvider>
      </Router>
    </React.StrictMode>
  );
} catch (err) {
  showFatal(err instanceof Error ? err.message : String(err));
}
