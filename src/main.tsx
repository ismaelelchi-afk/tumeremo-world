import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { LanguageProvider } from './i18n';
import { PUBLIC_DOCUMENT } from './core/publicDocument';
import { installPublicModels } from './data/publicModels';
import { WorldCityView } from './apps/world/WorldCityView';

installPublicModels();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <WorldCityView doc={PUBLIC_DOCUMENT} studioHref={null} draftChip={null} />
    </LanguageProvider>
  </StrictMode>,
);
