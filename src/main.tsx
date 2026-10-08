import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/estilos/globals.css';
import '@/lib/tema';
import { App } from '@/App';

createRoot(document.getElementById('raiz') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
