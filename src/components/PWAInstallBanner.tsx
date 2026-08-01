import React, { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'simpel_pwa_install_dismissed';

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [swReg, setSwReg] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    // Listen for SW update
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        setSwReg(reg);
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdateReady(true);
              }
            });
          }
        });
      });
    }

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      const alreadyDismissed = sessionStorage.getItem(DISMISSED_KEY);
      if (!alreadyDismissed) {
        setDeferredPrompt(e as BeforeInstallPromptEvent);
        setVisible(true);
      }
    };
    window.addEventListener('beforeinstallprompt', handler);

    // If already installed as PWA — hide banner
    const mq = window.matchMedia('(display-mode: standalone)');
    if (mq.matches) setVisible(false);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'dismissed') {
      sessionStorage.setItem(DISMISSED_KEY, '1');
    }
    setDeferredPrompt(null);
    setVisible(false);
    setInstalling(false);
  };

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  };

  const handleUpdate = () => {
    if (swReg && swReg.waiting) {
      swReg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  };

  // Update banner takes priority
  if (updateReady) {
    return (
      <div style={{
        position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        border: '1px solid #10b981', borderRadius: '12px',
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '14px',
        boxShadow: '0 8px 32px rgba(16,185,129,0.25)', zIndex: 9999,
        color: '#f1f5f9', fontFamily: 'Inter, sans-serif', fontSize: '13px',
        maxWidth: '420px', width: 'calc(100vw - 40px)'
      }}>
        <span style={{ fontSize: '18px' }}>🔄</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: '#10b981', marginBottom: '2px' }}>Update Available</div>
          <div style={{ opacity: 0.8, fontSize: '12px' }}>SimPEL has been updated. Reload to apply.</div>
        </div>
        <button onClick={handleUpdate} style={{
          background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px',
          padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: '12px'
        }}>Reload</button>
        <button onClick={() => setUpdateReady(false)} style={{
          background: 'transparent', color: '#94a3b8', border: 'none',
          cursor: 'pointer', fontSize: '16px', padding: '0 4px'
        }}>✕</button>
      </div>
    );
  }

  if (!visible || !deferredPrompt) return null;

  return (
    <div style={{
      position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      border: '1px solid #334155', borderRadius: '14px',
      padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 9999,
      color: '#f1f5f9', fontFamily: 'Inter, sans-serif', fontSize: '13px',
      maxWidth: '480px', width: 'calc(100vw - 40px)',
      animation: 'slideUpBanner 0.4s cubic-bezier(0.34,1.56,0.64,1) both'
    }}>
      <style>{`
        @keyframes slideUpBanner {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
      <div style={{
        width: '42px', height: '42px', borderRadius: '10px',
        background: 'linear-gradient(135deg, #10b981, #0ea5e9)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontSize: '20px'
      }}>⚡</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, marginBottom: '3px', color: '#f8fafc' }}>
          Install SimPEL
        </div>
        <div style={{ opacity: 0.65, fontSize: '12px', lineHeight: '1.4' }}>
          Full offline experience — simulate circuits without internet
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button onClick={handleInstall} disabled={installing} style={{
          background: 'linear-gradient(135deg, #10b981, #0ea5e9)',
          color: '#fff', border: 'none', borderRadius: '8px',
          padding: '8px 16px', cursor: installing ? 'wait' : 'pointer',
          fontWeight: 700, fontSize: '12px', opacity: installing ? 0.7 : 1,
          transition: 'opacity 0.2s'
        }}>
          {installing ? 'Installing…' : 'Install'}
        </button>
        <button onClick={handleDismiss} style={{
          background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
          border: '1px solid #334155', borderRadius: '8px',
          padding: '8px 10px', cursor: 'pointer', fontSize: '12px'
        }}>Not now</button>
      </div>
    </div>
  );
}
