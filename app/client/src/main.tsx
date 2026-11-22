import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { BrandingProvider } from './lib/branding';
import { ToastProvider } from './components/ui';
import App from './App';
import './lib/fonts';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* basename = My Webapp install path (VITE_BASE_PATH) */}
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <BrandingProvider>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrandingProvider>
    </BrowserRouter>
  </StrictMode>,
);
