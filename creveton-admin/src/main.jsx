import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { colors } from './constants/theme.js';
import './i18n';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { fontFamily: "'Space Grotesk', sans-serif", fontSize: '13.5px', borderRadius: '10px' },
          success: { iconTheme: { primary: colors.green500, secondary: '#fff' } },
        }}
      />
    </BrowserRouter>
  </StrictMode>,
);
