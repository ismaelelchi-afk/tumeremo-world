import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App, { type PrivateMode } from './App';
import { LanguageProvider } from './i18n';
import { installLanguagePersistence } from './i18n/languagePersistence';
import { documentStore } from './core/store';
import { initCustomModels } from './data/customModels';

/** Entrada privada: el router decide entre STUDIO y `/usuario` según la ruta. */
installLanguagePersistence();

const mode: PrivateMode = location.pathname === '/usuario' ? 'user' : 'studio';

void initCustomModels().then(() => documentStore.init()).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LanguageProvider>
        <App mode={mode} />
      </LanguageProvider>
    </StrictMode>,
  );
});
