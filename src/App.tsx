import { useEffect, useState } from 'react';
import { StudioApp } from './apps/studio/StudioApp';
import { WorldCityApp } from './apps/world/WorldCityApp';
import { useI18n } from './i18n';

type Mode = 'world' | 'studio' | 'user';

function detectMode(): Mode {
  if (/^\/usuario\/?$/.test(location.pathname)) return 'user';
  if (/studio(\.html)?\/?$/.test(location.pathname) || location.hash.startsWith('#/studio')) return 'studio';
  return 'world';
}

/**
 * Router del bundle privado: STUDIO edita el borrador y `/usuario` lo visualiza
 * con el mismo documento y los mismos modelos, sin publicar ni reconstruir WORLD.
 * La entrada pública no importa este archivo.
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
    const key =
      mode === 'studio' ? 'app.studio' : mode === 'user' ? 'app.user' : 'app.world';
    const description =
      mode === 'studio' ? 'app.studioDescription' : mode === 'user' ? 'app.userDescription' : 'app.description';
    document.title = t(key);
    document.querySelector('meta[name="description"]')?.setAttribute('content', t(description));
  }, [mode, t]);

  if (mode === 'studio') return <StudioApp />;
  return <WorldCityApp privateView={mode === 'user'} />;
}
