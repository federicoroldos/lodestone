import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ServerProvider } from './context/ServerContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <ServerProvider>
        <App />
        <Toaster
          theme="dark"
          position="bottom-center"
          toastOptions={{
            classNames: {
              toast: 'border border-border bg-card text-foreground shadow-xl',
              error: 'border-status-error/40 bg-card',
              success: 'border-primary/30 bg-card',
            },
          }}
        />
      </ServerProvider>
    </AuthProvider>
  </React.StrictMode>
);
