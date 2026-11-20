import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { LanguageProvider } from './i18n';
import { documentStore } from './core/store';
import { initCustomModels } from './data/customModels';

/** Entrada principal: index.html (WORLD). O STUDIO abre em `#/studio` (ou em studio.html no servidor de desenvolvimento). */
void initCustomModels().then(() => documentStore.init()).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </StrictMode>,
  );
});
