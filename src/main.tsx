import {StrictMode, useState, useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import StudentApp from './StudentApp.tsx';
import GamePlayer from './components/GamePlayer.tsx';
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
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('ServiceWorker registration successful with scope: ', reg.scope);
      })
      .catch((err) => {
        console.error('ServiceWorker registration failed: ', err);
      });
  });
}
