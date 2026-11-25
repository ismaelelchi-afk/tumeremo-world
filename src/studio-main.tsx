import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { LanguageProvider } from './i18n';
import { installLanguagePersistence } from './i18n/languagePersistence';
import { documentStore } from './core/store';
import { initCustomModels } from './data/customModels';

/** Entrada de studio.html: mesma aplicação, modo STUDIO fixo. */
installLanguagePersistence();

void initCustomModels().then(() => documentStore.init()).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LanguageProvider>
        <App forceMode="studio" />
      </LanguageProvider>
    </StrictMode>,
  );
});
