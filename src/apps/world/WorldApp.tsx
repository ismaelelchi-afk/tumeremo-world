import { useCallback, useEffect, useMemo, useState } from 'react';
import { documentStore, useDocumentState } from '../../core/store';
import type { CameraView, WorldSelection } from '../../core/types';
import { useI18n } from '../../i18n';
import { Icon, LogoMark } from '../../ui/Icon';
import { LanguageSwitch } from '../../ui/LanguageSwitch';
import { Toast, useToast } from '../../ui/Toast';
import { VISUAL, useEngine } from '../../ui/useEngine';
import { AboutPanel } from './AboutPanel';
import { ExplorePanel } from './ExplorePanel';
import { InfoPanel } from './InfoPanel';

const THEME_KEY = 'tumeremo-world:theme';

interface Props {
  /** Quando presente, o WORLD é exibido como pré-visualização dentro do STUDIO. */
  preview?: { onExit: () => void; initialView?: CameraView };
}

export function WorldApp({ preview }: Props) {
  const state = useDocumentState();
  const doc = state.doc;
  const toast = useToast();
  const { t } = useI18n();

  const [theme, setTheme] = useState<string>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved && VISUAL.themes[saved] ? saved : VISUAL.defaultTheme;
  });
  const [sel, setSel] = useState<WorldSelection | null>(null);
  const [view, setView] = useState({ bearing: 0, pitch: 0 });
  const [explore, setExplore] = useState(false);
  const [about, setAbout] = useState(false);
  const [locating, setLocating] = useState(false);

  const isMobile = () => window.matchMedia('(max-width: 767px)').matches;

  const { ref, engine, ready } = useEngine(
    'world',
    theme,
    {
      onPick: (hit) => {
        if (!hit) return setSel(null);
        if (hit.kind === 'place' || hit.kind === 'building') setSel({ kind: hit.kind, id: hit.id });
      },
      onView: (v) => setView((o) => (Math.abs(o.bearing - v.bearing) > 0.5 || Math.abs(o.pitch - v.pitch) > 0.5 ? { bearing: v.bearing, pitch: v.pitch } : o)),
      onReady: () => {},
      onMapError: () => toast.show(t('world.mapError'), 6000),
      onTransform: () => {},
      onGestureEnd: () => {},
    },
    preview?.initialView,
  );

  // dados → motor
  useEffect(() => {
    engine?.setData(doc, { showUnpublished: false });
  }, [engine, doc]);

  // voo de abertura (apenas no WORLD público)
  useEffect(() => {
    if (engine && ready && !preview) engine.intro();
  }, [engine, ready, preview]);

  // posição da seleção (para centralizar acima do painel no celular)
  const selectionPoint = useCallback(
    (s: WorldSelection) => {
      if (s.kind === 'place') return doc.places?.find((p) => p.id === s.id)?.position ?? null;
      if (s.kind === 'building') return doc.buildings.find((b) => b.id === s.id)?.placement.position ?? null;
      const b = doc.businesses.find((x) => x.id === s.id);
      return doc.buildings.find((x) => x.id === b?.buildingId)?.placement.position ?? null;
    },
    [doc],
  );

  // um ponto oculto/removido no STUDIO deixa de ser selecionável no WORLD
  useEffect(() => {
    if (sel?.kind === 'place' && !doc.places?.some((p) => p.id === sel.id && p.visible !== false)) setSel(null);
  }, [doc, sel]);

  // destaque no mapa + enquadramento
  useEffect(() => {
    if (!engine) return;
    if (!sel) {
      engine.setSelection(null);
      engine.map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 400 });
      return;
    }
    if (sel.kind === 'place') engine.setSelection({ kind: 'place', id: sel.id });
    else if (sel.kind === 'building') engine.setSelection({ kind: 'building', id: sel.id });
    else {
      const b = doc.businesses.find((x) => x.id === sel.id);
      engine.setSelection(b?.buildingId ? { kind: 'building', id: b.buildingId } : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, sel]);

  const select = useCallback(
    (s: WorldSelection, fly = true) => {
      setSel(s);
      setExplore(false);
      const p = selectionPoint(s);
      if (engine && p && fly) {
        const bottom = isMobile() ? Math.round(window.innerHeight * 0.3) : 0;
        engine.map.flyTo({
          center: [p.lng, p.lat],
          zoom: Math.max(engine.map.getZoom(), 17.6),
          padding: { top: 0, left: 0, right: 0, bottom },
          duration: 1400,
          essential: true,
        });
      }
    },
    [engine, selectionPoint],
  );

  // toques no mapa também ajustam o enquadramento no celular
  useEffect(() => {
    if (!engine || !sel || !isMobile()) return;
    const p = selectionPoint(sel);
    if (!p) return;
    engine.map.easeTo({ center: [p.lng, p.lat], padding: { top: 0, left: 0, right: 0, bottom: Math.round(window.innerHeight * 0.3) }, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.id]);

  const toggleTheme = () => {
    const next = theme === 'noite' ? 'dia' : 'noite';
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
  };

  const locate = async () => {
    if (!engine || locating) return;
    setLocating(true);
    const r = await engine.locate();
    setLocating(false);
    if (r === 'denied') toast.show(t('world.locationDenied'));
    else if (r === 'unsupported') toast.show(t('world.locationUnsupported'));
    else if (r === 'outside') toast.show(t('world.locationOutside'), 4500);
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast.show(t('world.coordsCopied')),
      () => toast.show(t('world.copyFailed')),
    );
  };

  const palette = VISUAL.themes[theme];
  const is3d = view.pitch > 12;
  const usingDraft = state.source === 'draft' && state.hasDraft;
  const studioHref = useMemo(() => '#/studio', []);

  return (
    <div className="app-root" data-ui={palette.ui}>
      <div ref={ref} className="absolute inset-0" />

      {/* marca + estado */}
      <header className="pointer-events-none fixed left-0 top-0 z-20 flex w-full items-start justify-between p-3" style={{ paddingTop: 'calc(var(--safe-t) + 12px)' }}>
        <div className="pointer-events-auto flex flex-col items-start gap-2">
          {preview ? (
            <button className="glass flex items-center gap-2 rounded-full py-2 pl-3 pr-4 font-semibold" onClick={preview.onExit}>
              <Icon name="back" size={18} /> {t('world.backToStudio')}
            </button>
          ) : (
            <button className="glass flex items-center gap-2.5 rounded-full py-1.5 pl-2.5 pr-4" onClick={() => setAbout(true)} aria-label={t('world.aboutAria')}>
              <LogoMark />
              <span className="text-left leading-none">
                <span className="block text-[13px] font-extrabold tracking-[0.2em]">TUMEREMO</span>
                <span className="block pt-[3px] text-[10px] font-semibold tracking-[0.34em]" style={{ color: 'var(--accent)' }}>
                  WORLD
                </span>
              </span>
            </button>
          )}
          {preview && (
            <span className="chip glass">{t('world.previewChip')}</span>
          )}
          {!preview && usingDraft && (
            <button className="chip glass" onClick={() => documentStore.setSource('original')} title={t('world.draftTitle')}>
              <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} />
              {t('world.draftChip')}
            </button>
          )}
          {!preview && state.source === 'original' && state.hasDraft && (
            <button className="chip glass" onClick={() => documentStore.setSource('draft')}>
              {t('world.originalChip')}
            </button>
          )}
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <LanguageSwitch />
          <button
            className="glass pointer-events-auto grid h-[52px] w-[52px] place-items-center rounded-full"
            onClick={() => engine?.resetNorth()}
            aria-label={t('world.resetNorth')}
          >
            <svg width="34" height="34" viewBox="0 0 40 40" style={{ transform: `rotate(${-view.bearing}deg)`, transition: 'transform 0.1s linear' }} aria-hidden>
              <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeOpacity="0.2" />
              <path d="M20 5 25 20H15Z" fill="#ff6b5e" />
              <path d="M20 35 15 20H25Z" fill="currentColor" opacity="0.45" />
              <text x="20" y="14.500" fontSize="0" />
            </svg>
            <span className="pointer-events-none absolute -bottom-0.5 text-[9px] font-bold" style={{ color: 'var(--muted)' }}>
              {Math.round(((view.bearing % 360) + 360) % 360)}°
            </span>
          </button>
        </div>
      </header>

      {/* controles laterais */}
      <div
        className="fixed right-3 z-20 flex flex-col items-center gap-2.5"
        style={{ bottom: sel && isMobile() ? undefined : 'calc(var(--safe-b) + 84px)', top: sel && isMobile() ? 'calc(var(--safe-t) + 84px)' : undefined }}
      >
        <div className="glass flex flex-col overflow-hidden rounded-full p-1" role="group" aria-label={t('world.perspectiveAria')}>
          <button className="fab !h-[42px] !w-[46px] text-[12px] font-extrabold" data-on={!is3d} onClick={() => engine?.setPerspective('2d')} aria-pressed={!is3d}>
            2D
          </button>
          <button className="fab !h-[42px] !w-[46px] text-[12px] font-extrabold" data-on={is3d} onClick={() => engine?.setPerspective('3d')} aria-pressed={is3d}>
            3D
          </button>
        </div>
        <button className="glass fab" onClick={locate} aria-label={t('world.locateAria')} style={locating ? { opacity: 0.6 } : undefined}>
          <Icon name="locate" />
        </button>
        <button className="glass fab" onClick={toggleTheme} aria-label={theme === 'noite' ? t('world.themeToDay') : t('world.themeToNight')}>
          <Icon name={theme === 'noite' ? 'sun' : 'moon'} />
        </button>
      </div>

      {/* busca */}
      {!sel && (
        <button
          className="glass fixed bottom-3 left-3 right-[60px] z-20 flex h-[52px] items-center gap-3 rounded-full px-4 text-left md:right-auto md:w-[360px]"
          style={{ bottom: 'calc(var(--safe-b) + 12px)' }}
          onClick={() => setExplore(true)}
        >
          <Icon name="search" size={20} />
          <span style={{ color: 'var(--muted)' }}>{t('world.searchCta')}</span>
        </button>
      )}

      {sel && <InfoPanel selection={sel} doc={doc} onSelect={select} onClose={() => setSel(null)} onCopy={copy} />}
      {explore && (
        <ExplorePanel
          doc={doc}
          onPick={(s) => select(s)}
          onHome={() => {
            engine?.goHome();
            setExplore(false);
          }}
          onClose={() => setExplore(false)}
        />
      )}
      {about && <AboutPanel onClose={() => setAbout(false)} studioHref={studioHref} />}

      {!ready && (
        <div className="fade pointer-events-none fixed inset-0 z-10 grid place-items-center" style={{ background: '#0a1014' }}>
          <div className="flex flex-col items-center gap-4">
            <LogoMark size={52} />
            <span className="text-[12px] font-bold tracking-[0.4em]" style={{ color: '#8da0ab' }}>
              {t('common.loadingMap')}
            </span>
          </div>
        </div>
      )}
      <Toast msg={toast.msg} />
    </div>
  );
}
