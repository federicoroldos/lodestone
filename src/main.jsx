import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ServerProvider } from './context/ServerContext';
import { I18nProvider } from './context/I18nContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <AuthProvider>
        <ServerProvider>
          <App />
          <Toaster
            theme="dark"
            position="bottom-right"
            richColors
            closeButton
            duration={3500}
            gap={10}
            swipeDirections={['left', 'right', 'bottom']}
            toastOptions={{
              classNames: {
                toast: 'rounded-lg border shadow-xl backdrop-blur-sm text-sm',
                title: 'font-medium',
                closeButton: 'border-border bg-card text-muted-foreground hover:text-foreground',
              },
            }}
          />
        </ServerProvider>
      </AuthProvider>
    </I18nProvider>
  </React.StrictMode>
);
