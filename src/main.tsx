import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import StudentApp from './StudentApp.tsx';
import './index.css';

const queryParams = new URLSearchParams(window.location.search);
const mode = queryParams.get('mode') || 'creator';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {mode === 'student' ? <StudentApp /> : <App />}
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
