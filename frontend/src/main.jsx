import '@fontsource-variable/figtree';
import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/noto-sans-devanagari';
import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './lib/auth';
import { I18nProvider } from './lib/i18n';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
);
