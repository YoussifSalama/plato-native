import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { ConfirmProvider } from './components/ConfirmDialog';
import { MotionProvider } from './components/MotionProvider';
import { reloadForDeploy } from './components/RouteError';
import { AuthProvider } from './lib/auth';
import { router } from './router';
import './index.css';

// A deploy replaced the page files while this tab was open: load the new build (once).
window.addEventListener('vite:preloadError', (e) => {
  if (reloadForDeploy()) e.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionProvider>
      <AuthProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </AuthProvider>
    </MotionProvider>
    <Toaster position="top-right" richColors closeButton />
  </StrictMode>,
);
