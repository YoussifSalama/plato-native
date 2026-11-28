import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { ConfirmProvider } from './components/ConfirmDialog';
import { AuthProvider } from './lib/auth';
import { router } from './router';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>
    </AuthProvider>
    <Toaster position="top-right" richColors closeButton />
  </StrictMode>,
);
