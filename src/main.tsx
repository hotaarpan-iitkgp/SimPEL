import { StrictMode, useState, useEffect, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import StudentApp from './StudentApp.tsx';
import GamePlayer from './components/GamePlayer.tsx';
import PWAInstallBanner from './components/PWAInstallBanner.tsx';
import './index.css';

function MainRouter() {
  const [currentMode, setCurrentMode] = useState<'creator' | 'student' | 'game'>(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const searchMode = queryParams.get('mode');
    if (searchMode === 'student' || searchMode === 'game' || searchMode === 'creator') {
      return searchMode;
    }
    if (window.location.hash === '#/student') return 'student';
    if (window.location.hash === '#/game') return 'game';
    return 'creator';
  });

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#/student') {
        setCurrentMode('student');
      } else if (window.location.hash === '#/game') {
        setCurrentMode('game');
      } else if (window.location.hash === '#/creator') {
        setCurrentMode('creator');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (currentMode === 'student') return <StudentApp />;
  if (currentMode === 'game') return <GamePlayer onBack={() => { window.location.search = '?mode=creator'; }} />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MainRouter />
    <PWAInstallBanner />
  </StrictMode>,
);

// ─── Service Worker Registration ───────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[SimPEL PWA] Service Worker registered:', reg.scope);

      // Listen for controller change (after skipWaiting from update banner)
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });

    } catch (err) {
      console.error('[SimPEL PWA] Service Worker registration failed:', err);
    }
  });
}
