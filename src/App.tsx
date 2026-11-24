import { useEffect, useState } from 'react';
import { StudioApp } from './apps/studio/StudioApp';
import { useI18n } from './i18n';
import { WorldCityApp } from './apps/world/WorldCityApp';

type Mode = 'world' | 'studio';

function detectMode(): Mode {
  if (/studio(\.html)?\/?$/.test(location.pathname) || location.hash.startsWith('#/studio')) return 'studio';
  return 'world';
}

/**
 * Dois produtos, um motor: WORLD (público) e STUDIO (editor). O modo vem de studio.html
 * ou de `#/studio` — assim o build de arquivo único (dist/index.html) contém os dois.
 */
export default function App({ forceMode }: { forceMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(forceMode ?? detectMode());
  const { t } = useI18n();

  useEffect(() => {
    if (forceMode) return;
    const onHash = () => setMode(detectMode());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [forceMode]);

  useEffect(() => {
    const studio = mode === 'studio';
    document.title = studio ? t('app.studio') : t('app.world');
    document.querySelector('meta[name="description"]')?.setAttribute('content', t(studio ? 'app.studioDescription' : 'app.description'));
  }, [mode, t]);

  return mode === 'studio' ? <StudioApp /> : <WorldCityApp />;
}
