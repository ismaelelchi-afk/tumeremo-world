import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { LanguageProvider } from './i18n';
import { installLanguagePersistence } from './i18n/languagePersistence';
import { documentStore } from './core/store';
import { initCustomModels } from './data/customModels';

/** Entrada privada: el router decide entre STUDIO y `/usuario` según la ruta. */
installLanguagePersistence();

void initCustomModels().then(() => documentStore.init()).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LanguageProvider>
        <App forceMode={/^\/usuario\/?$/.test(location.pathname) ? 'user' : 'studio'} />
      </LanguageProvider>
    </StrictMode>,
  );
});
