import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme, readStoredThemePreference, resolveTheme } from './lib/theme';
import './styles/index.css';

// Apply the stored theme before the first render so there is no flash of the wrong one.
applyTheme(resolveTheme(readStoredThemePreference()));

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
