/**
 * Evolución de WORLD inspirada en Tumeremo-3D (cabecera, buscador, categorías,
 * directorio y controles) sobre el motor real de Tumeremo World. Recibe el
 * documento como prop para que el bundle público no dependa del almacén local;
 * `/usuario` le pasa el borrador del STUDIO.
 *
 * Los tres edificios oficiales forman parte del WorldDocument compartido: WORLD lo
 * consume directamente, sin copias aumentadas ni duplicados.
 *
 * Sus fichas comerciales combinan los campos editables del `Business` del documento
 * con los datos originales de `tumeremo-3d` y una vitrina preparada para catálogo
 * futuro.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { normalizeText } from '../../core/geo';
import { businessCategoryLabel, placeCategoryLabel } from '../../core/labels';
import type { CameraView, WorldDocument, WorldSelection } from '../../core/types';
import { prefersReducedMotion, type PickResult } from '../../engine/WorldEngine';
import { localizedText, useI18n } from '../../i18n';
import { Icon, LogoMark, type IconName } from '../../ui/Icon';
import { LanguageSwitch } from '../../ui/LanguageSwitch';
import { Toast, useToast } from '../../ui/Toast';
import { VISUAL, useEngine } from '../../ui/useEngine';
import { AboutPanel } from './AboutPanel';
import { WorldBusinessPanel } from './BusinessPanel';
import { parseWorldHash, worldHash, type WorldHistoryState } from './deepLink';
import { composeWorldBusinessProfile, type ComposedWorldBusinessProfile } from './worldBusinessProfiles';
import { resolveOrbitTarget, useWorldCamera } from './useWorldCamera';
import { FEATURE_BUILDING_IDS } from './worldBuildings';

const GAP = 16;
/** Callbacks estables: el mapa no necesita transform/gesture durante el desplazamiento táctil. */
const NOOP = () => {};
/** La vista se lee de `engine.getView()` al terminar el movimiento: evita renders por frame. */
const WORLD_ENGINE_OPTIONS = { emitView: false };

type Filter = 'all' | 'places' | 'business' | 'buildings';

interface CityItem {
  key: string;
  title: string;
  subtitle: string;
  group: Filter;
  icon: IconName;
  color: string;
  sel: WorldSelection;
  description?: string;
  /** Procedencia verificable (OSM) o nota del lugar, para distinguirlo del contenido demo. */
  facts?: string;
  osmUrl?: string;
  /** Solo los tres ejemplos oficiales llevan ficha comercial completa. */
  profile?: ComposedWorldBusinessProfile;
}

function useIsDesktop() {
  const [value, setValue] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setValue(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return value;
}

export interface WorldCityViewProps {
  doc: WorldDocument;
  studioHref?: string | null;
  draftChip?: { source: 'draft' | 'original'; onToggle: () => void } | null;
  /** Solo `/usuario` lo activa: el bundle público mantiene el valor por defecto. */
  showUnpublished?: boolean;
  /** La entrada privada inyecta la preferencia guardada; la pública no persiste nada. */
  initialTheme?: string;
  onThemeChange?: (theme: string) => void;
}

export function WorldCityView({
  doc,
  studioHref = null,
  draftChip = null,
  showUnpublished = false,
  initialTheme,
  onThemeChange,
}: WorldCityViewProps) {
  const { lang, t } = useI18n();
  const toast = useToast();
  const isDesktop = useIsDesktop();

  const [theme, setTheme] = useState<string>(
    () => (initialTheme && VISUAL.themes[initialTheme] ? initialTheme : VISUAL.defaultTheme),
  );
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<WorldSelection | null>(null);
  /** Estado de la hoja inferior comercial; se reinicia al cambiar de selección. */
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [about, setAbout] = useState(false);
  const [headerH, setHeaderH] = useState(132);
  const [inputFocused, setInputFocused] = useState(false);
  const [suggestion, setSuggestion] = useState(0);
  /** Última vista asentada de la cámara: alimenta brújula, 2D/3D y el historial de deep links. */
  const [view, setView] = useState<CameraView | null>(null);
  const [deepLinked, setDeepLinked] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickHandlerRef = useRef<(hit: PickResult | null) => void>(() => {});
  const itemsRef = useRef<CityItem[]>([]);
  const lastHashRef = useRef(location.hash);

  const { ref, engine, ready } = useEngine(
    'world',
    theme,
    {
      onPick: (hit) => pickHandlerRef.current(hit),
      onView: NOOP,
      onReady: NOOP,
      onMapError: () => toast.show(t('world.mapError'), 6000),
      onTransform: NOOP,
      onGestureEnd: NOOP,
    },
    undefined,
    WORLD_ENGINE_OPTIONS,
  );

  // Un único sistema orbital para WORLD y para la vista privada de `/usuario`.
  const { focusOn, startOrbit, stopOrbit, cancelFocus, orbiting } = useWorldCamera(engine, doc, isDesktop);

  useEffect(() => {
    if (!engine) return;
    const sync = () => setView(engine.getView());
    sync();
    engine.map.on('moveend', sync);
    return () => {
      engine.map.off('moveend', sync);
    };
  }, [engine]);

  // Los modelos de los tres comercios ya están en MODEL_LIBRARY desde el arranque.
  // El mapa real y sus datos siguen siendo la fuente: solo cambia la capa visual.
  useEffect(() => {
    engine?.setData(doc, { showUnpublished });
  }, [engine, doc, showUnpublished]);

  useEffect(() => {
    if (engine && ready) engine.intro();
  }, [engine, ready]);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderH(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const items = useMemo<CityItem[]>(() => {
    const list: CityItem[] = [];
    const keys = new Set<string>();
    const add = (item: CityItem) => {
      if (keys.has(item.key)) return;
      keys.add(item.key);
      list.push(item);
    };
    for (const b of doc.businesses) {
      if ((!showUnpublished && !b.published) || !b.buildingId) continue;
      // Los tres edificios oficiales son una sola ficha: comercio + construcción.
      const feature = FEATURE_BUILDING_IDS.has(b.buildingId);
      add({
        key: feature ? b.buildingId : b.id,
        title: localizedText(b, 'name', lang),
        subtitle: `${businessCategoryLabel(b.category, lang)}${b.origin === 'demo' ? t('explore.bizDemo') : ''}`,
        group: 'business',
        icon: 'store',
        color: b.color,
        sel: feature ? { kind: 'building', id: b.buildingId } : { kind: 'business', id: b.id },
        description: feature ? localizedText(b, 'description', lang) : undefined,
        profile: feature ? composeWorldBusinessProfile(b, lang) : undefined,
      });
    }
    for (const b of doc.buildings) {
      if (!b.visible || FEATURE_BUILDING_IDS.has(b.id)) continue;
      add({
        key: b.id,
        title: localizedText(b, 'name', lang),
        subtitle: b.origin === 'demo' ? t('explore.buildingDemo') : t('explore.buildingPlain'),
        group: 'buildings',
        icon: 'building',
        color: '#9fb4c7',
        sel: { kind: 'building', id: b.id },
      });
    }
    for (const p of doc.places ?? []) {
      if (!p.visible) continue;
      const real = p.source?.type === 'osm';
      add({
        key: p.id,
        title: localizedText(p, 'name', lang),
        subtitle: `${placeCategoryLabel(p.category, lang)}${real ? t('explore.placeReal') : ` · ${t('info.digitalBuilding')}`}`,
        group: 'places',
        icon: p.icon ?? 'pin',
        color: VISUAL.placeColors[p.category] ?? VISUAL.placeColors.other,
        sel: { kind: 'place', id: p.id },
        facts: real ? `${t('info.osmSource')} ${p.position.lat.toFixed(5)}, ${p.position.lng.toFixed(5)}` : p.description,
        osmUrl: real
          ? `https://www.openstreetmap.org/?mlat=${p.position.lat}&mlon=${p.position.lng}#map=18/${p.position.lat}/${p.position.lng}`
          : undefined,
      });
    }
    return list;
  }, [doc, lang, t, showUnpublished]);
  itemsRef.current = items;

  const nq = normalizeText(query.trim());
  const filtered = useMemo(
    () => items.filter((i) => (filter === 'all' || i.group === filter) && (!nq || normalizeText(`${i.title} ${i.subtitle}`).includes(nq))),
    [items, filter, nq],
  );
  const suggestions = useMemo(
    () => (nq ? items.filter((i) => normalizeText(`${i.title} ${i.subtitle}`).includes(nq)).slice(0, 6) : []),
    [items, nq],
  );
  const counts = useMemo(
    () => ({
      all: items.length,
      places: items.filter((i) => i.group === 'places').length,
      business: items.filter((i) => i.group === 'business').length,
      buildings: items.filter((i) => i.group === 'buildings').length,
    }),
    [items],
  );

  // Uma entidade ocultada/removida no STUDIO deixa de ser selecionável no WORLD.
  useEffect(() => {
    if (selected?.kind === 'place' && !doc.places?.some((p) => p.id === selected.id && p.visible !== false)) setSelected(null);
  }, [doc, selected]);

  useEffect(() => {
    if (!engine) return;
    if (!selected) return engine.setSelection(null);
    if (selected.kind === 'business') {
      const b = doc.businesses.find((x) => x.id === selected.id);
      engine.setSelection(b?.buildingId ? { kind: 'building', id: b.buildingId } : null);
    } else {
      engine.setSelection(selected);
    }
  }, [engine, selected, doc.businesses]);

  /** Registra la selección en la URL y guarda la cámara previa para poder volver atrás. */
  const pushSelection = useCallback(
    (sel: WorldSelection, key: string) => {
      const current = history.state as WorldHistoryState | null;
      if (current?.worldItem === key && location.hash === worldHash(sel)) return;
      history.pushState({ worldView: engine?.getView(), worldItem: key } satisfies WorldHistoryState, '', worldHash(sel));
      lastHashRef.current = location.hash;
      setDeepLinked(true);
    },
    [engine],
  );

  /** Cierra la ficha: con deep link se vuelve al estado anterior del historial. */
  const closeSelection = useCallback(() => {
    stopOrbit();
    setSheetExpanded(false);
    setSelected(null);
    engine?.setSelection(null);
    const current = history.state as WorldHistoryState | null;
    if (deepLinked && current?.worldItem) history.back();
  }, [deepLinked, engine, stopOrbit]);

  /** Restaura (o abre) la entidad enlazada, reconstruyendo la cámara guardada si existe. */
  const applyHistory = useCallback(
    (force = false) => {
      if (!force && location.hash === lastHashRef.current) return;
      lastHashRef.current = location.hash;
      const link = parseWorldHash(location.hash);
      const current = history.state as WorldHistoryState | null;
      const item = link ? itemsRef.current.find((i) => i.sel.kind === link.kind && i.key === link.id) : undefined;
      cancelFocus();
      stopOrbit();
      setSheetExpanded(false);
      setDeepLinked(!!item);
      setSelected(item?.sel ?? null);
      // El motor solo resalta lugares y construcciones: un comercio se resalta en su edificio.
      const marker =
        item?.sel.kind === 'business'
          ? (() => {
              const b = doc.businesses.find((x) => x.id === item.sel.id);
              return b?.buildingId ? ({ kind: 'building' as const, id: b.buildingId } as const) : null;
            })()
          : item?.sel ?? null;
      engine?.setSelection(marker);
      if (current?.worldView) {
        engine?.map.jumpTo(current.worldView);
        setView(current.worldView);
      } else if (item) {
        focusOn(item.sel);
      }
    },
    [cancelFocus, doc.businesses, engine, focusOn, stopOrbit],
  );

  const appliedHistoryRef = useRef(false);
  useEffect(() => {
    if (engine && ready && !appliedHistoryRef.current) {
      appliedHistoryRef.current = true;
      applyHistory(true);
    }
    const onNav = () => applyHistory(true);
    window.addEventListener('popstate', onNav);
    window.addEventListener('hashchange', onNav);
    return () => {
      window.removeEventListener('popstate', onNav);
      window.removeEventListener('hashchange', onNav);
    };
  }, [applyHistory, engine, ready]);

  // Tocar un edificio en el mapa selecciona y enfoca, igual que elegirlo en el directorio.
  pickHandlerRef.current = (hit) => {
    setSheetExpanded(false);
    setInputFocused(false);
    if (!hit) return closeSelection();
    if (hit.kind === 'place' || hit.kind === 'building') {
      const sel: WorldSelection = { kind: hit.kind, id: hit.id };
      stopOrbit();
      const match = itemsRef.current.find((i) => i.sel.kind === sel.kind && i.key === sel.id);
      pushSelection(sel, match?.key ?? sel.id);
      setSelected(sel);
      focusOn(sel);
    }
  };

  const select = useCallback(
    (item: CityItem) => {
      stopOrbit();
      pushSelection(item.sel, item.key);
      setSelected(item.sel);
      setSheetExpanded(false);
      setQuery('');
      setInputFocused(false);
      inputRef.current?.blur();
      if (!isDesktop) setDirectoryOpen(false);
      focusOn(item.sel);
    },
    [focusOn, isDesktop, pushSelection, stopOrbit],
  );

  /** Restaura el límite de zoom de la vista general al terminar el vuelo de regreso. */
  const returnHome = useCallback(() => {
    if (!engine) return;
    stopOrbit();
    engine.map.once('moveend', () => engine.map.setMaxZoom(VISUAL.maxZoom));
    engine.goHome();
  }, [engine, stopOrbit]);

  const explore = useCallback(() => {
    cancelFocus();
    stopOrbit();
    setQuery('');
    setFilter('all');
    const current = history.state as WorldHistoryState | null;
    if (deepLinked && current?.worldItem) {
      // El popstate restaura la ficha anterior y la cámara exacta que había antes de abrirla.
      history.back();
      return;
    }
    setSelected(null);
    setSheetExpanded(false);
    engine?.setSelection(null);
    returnHome();
  }, [cancelFocus, deepLinked, engine, returnHome, stopOrbit]);

  const clearFilters = () => {
    cancelFocus();
    setQuery('');
    setFilter('all');
    returnHome();
  };

  const changeFilter = (next: Filter) => {
    setFilter((current) => (current === next && next !== 'all' ? 'all' : next));
    if (next !== 'all' && isDesktop) setDirectoryOpen(true);
  };

  const toggleTheme = () => {
    const next = theme === 'noite' ? 'dia' : 'noite';
    setTheme(next);
    onThemeChange?.(next);
  };

  const rotate = (dir: 1 | -1) => {
    if (!engine) return;
    engine.map.easeTo({ bearing: engine.map.getBearing() + dir * 45, duration: prefersReducedMotion() ? 0 : 450 });
  };

  const togglePerspective = () => {
    if (!engine) return;
    engine.setPerspective((view?.pitch ?? engine.map.getPitch()) > 12 ? '2d' : '3d');
  };

  const locate = async () => {
    if (!engine) return;
    const result = await engine.locate();
    if (result === 'ok') return;
    toast.show(t(result === 'denied' ? 'world.locationDenied' : result === 'outside' ? 'world.locationOutside' : 'world.locationUnsupported'), 4000);
  };

  const selectedItem = items.find((i) => i.sel.kind === selected?.kind && i.key === selected?.id) ?? null;
  /** Toda ficha con construcción 3D puede orbitar; los Puntos conservan «Centrar». */
  const canOrbit = !!selectedItem && !!resolveOrbitTarget(doc, selectedItem.sel);
  /** En móvil la ficha comercial manda: retiramos buscador y categorías mientras está abierta. */
  const hideTopSearch = !isDesktop && !!selectedItem?.profile;
  const directoryTitle = nq
    ? t('city.resultsFor', { q: query.trim() })
    : filter === 'places'
      ? t('explore.places')
      : filter === 'business'
        ? t('explore.business')
        : filter === 'buildings'
          ? t('explore.buildings')
          : t('city.directoryTitle');

  const chips: Array<[Filter, string, string]> = [
    ['all', t('explore.all'), '#0b3b2e'],
    // Un filtro con cero resultados permanentes solo confunde al usuario público.
    ...(counts.places ? ([['places', t('explore.places'), '#127a4f']] as Array<[Filter, string, string]>) : []),
    ['business', t('explore.business'), '#e0a106'],
    ['buildings', t('explore.buildings'), '#5d6d7e'],
  ];

  return (
    <div className="app-root relative h-[100dvh] w-full overflow-hidden bg-[#e9f5ef]" data-ui={VISUAL.themes[theme]?.ui ?? 'light'}>
      <div ref={ref} className="absolute inset-0" />

      {/* Cabecera: marca (con acceso a STUDIO), buscador, idioma, directorio y categorías */}
      <div ref={headerRef} className="pointer-events-none absolute inset-x-0 top-0 z-40">
        <div className="pointer-events-auto flex flex-wrap items-start gap-2 px-3 pt-[calc(var(--safe-t)+12px)] sm:flex-nowrap sm:gap-4 sm:px-4">
          <div className="order-1 flex shrink-0 flex-col items-start gap-1.5">
            <button
              className="flex min-h-11 items-center gap-2.5 rounded-2xl bg-white px-2.5 py-1.5 shadow-lg shadow-slate-900/10 ring-1 ring-slate-200 transition active:scale-[0.98]"
              onClick={() => setAbout(true)}
              aria-label={t('world.aboutAria')}
            >
              <LogoMark size={26} />
              <span className="text-left leading-none">
                <span className="block text-[13px] font-extrabold tracking-[0.2em] text-[#0b3b2e]">TUMEREMO</span>
                <span className="block pt-[3px] text-[10px] font-bold tracking-[0.34em] text-[#e0a106]">WORLD</span>
              </span>
            </button>
          </div>

          {!hideTopSearch && (
            <div className="order-3 w-full min-w-0 sm:order-2 sm:max-w-xl sm:flex-1">
              <CitySearch
                inputRef={inputRef}
                value={query}
                onChange={(v) => {
                  setQuery(v);
                  setSuggestion(0);
                }}
                onPick={select}
                suggestions={suggestions}
                active={suggestion}
                setActive={setSuggestion}
                focused={inputFocused}
                onFocus={() => setInputFocused(true)}
                onBlur={() => window.setTimeout(() => setInputFocused(false), 150)}
                placeholder={t('explore.placeholder')}
                searchAria={t('explore.searchAria')}
                clearAria={t('city.clearSearch')}
                emptyText={nq ? t('explore.empty', { q: query.trim() }) : ''}
              />
            </div>
          )}

          <div className="order-2 ml-auto flex shrink-0 items-center gap-2 sm:order-3">
            {/* El WORLD público nunca debe mostrar ediciones locales sin decirlo. */}
            {draftChip && (
              <button
                className="chip min-h-11 !px-3 text-[11px]"
                onClick={draftChip.onToggle}
                title={draftChip.source === 'draft' ? t('world.draftTitle') : t('world.originalChip')}
                aria-label={draftChip.source === 'draft' ? t('world.draftTitle') : t('world.originalChip')}
              >
                <Icon name="layers" size={14} />
                <span className="hidden sm:inline">{t(draftChip.source === 'draft' ? 'world.draftChip' : 'world.originalChip')}</span>
              </button>
            )}
            {studioHref && (
              <a className="chip min-h-11 !px-3 text-[11px]" href={studioHref}>
                <Icon name="back" size={14} />
                <span className="hidden sm:inline">{t('world.backToStudio')}</span>
              </a>
            )}
            <LanguageSwitch compact />
            {isDesktop && (
              <button
                onClick={() => setDirectoryOpen((v) => !v)}
                aria-pressed={directoryOpen}
                className={`flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold ring-1 transition-colors ${
                  directoryOpen
                    ? 'bg-[#0b3b2e] text-white ring-[#0b3b2e]'
                    : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                <Icon name="list" size={16} />
                <span className="hidden md:inline">{t('city.directory')}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    directoryOpen ? 'bg-white/15 text-[#fbd567]' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {filtered.length}
                </span>
              </button>
            )}
          </div>
        </div>

        {!hideTopSearch && (
          <nav
            className="pointer-events-auto mt-2 flex gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-4"
            aria-label={t('city.filtersAria')}
          >
            {chips.map(([id, label, color]) => (
              <button
                key={id}
                onClick={() => changeFilter(id)}
                aria-pressed={filter === id}
                className={`flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full pl-3 pr-2 text-[13px] font-semibold shadow-sm ring-1 transition-all active:scale-95 ${
                  filter === id ? 'text-white ring-transparent shadow-md' : 'bg-white/95 text-slate-700 ring-slate-200 hover:bg-white'
                }`}
                style={filter === id ? { backgroundColor: color } : undefined}
              >
                {label}
                <span
                  className={`ml-0.5 grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold ${
                    filter === id ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {counts[id]}
                </span>
              </button>
            ))}
          </nav>
        )}
      </div>

      {/* Directorio */}
      {directoryOpen && (isDesktop || !selected) && (
        <div
          className={isDesktop ? 'pointer-events-none absolute z-30' : ''}
          style={isDesktop ? { top: headerH + 4, bottom: GAP, left: GAP } : undefined}
        >
          <CityDirectory
            items={filtered}
            selected={selected}
            isDesktop={isDesktop}
            title={directoryTitle}
            count={filtered.length}
            onPick={select}
            onClose={() => setDirectoryOpen(false)}
            onClear={clearFilters}
          />
        </div>
      )}

      {/* Ficha de la selección: hoja expandible en móvil, panel lateral en escritorio. */}
      {selectedItem && (
        <div
          className={isDesktop ? 'pointer-events-none absolute z-30' : ''}
          style={isDesktop ? { top: headerH + 4, bottom: GAP, right: GAP } : undefined}
        >
          {selectedItem.profile ? (
            <WorldBusinessPanel
              key={selectedItem.key}
              profile={selectedItem.profile}
              isDesktop={isDesktop}
              expanded={sheetExpanded}
              onExpand={setSheetExpanded}
              onClose={closeSelection}
              onOrbit={() => startOrbit(selectedItem.sel)}
              orbiting={orbiting}
              canOrbit={canOrbit}
              onExplore={explore}
              onDemoAction={(label) => toast.show(t('shop.demoAction', { label }), 2600)}
            />
          ) : (
            <CityCard
              key={selectedItem.key}
              item={selectedItem}
              isDesktop={isDesktop}
              onClose={closeSelection}
              onOrbit={() => startOrbit(selectedItem.sel)}
              orbiting={orbiting}
              canOrbit={canOrbit}
              onExplore={explore}
            />
          )}
        </div>
      )}

      {/* Controles del mapa: tema, giro, zoom y visión general */}
      {!(!isDesktop && (selectedItem || directoryOpen)) && (
        <div className="absolute right-3 z-20" style={{ top: headerH + 12 }}>
          <CityControls
            night={theme === 'noite'}
            bearing={Math.round(view?.bearing ?? engine?.map.getBearing() ?? 0)}
            perspective3d={(view?.pitch ?? engine?.map.getPitch() ?? 0) > 12}
            onToggleTheme={toggleTheme}
            onRotateLeft={() => rotate(-1)}
            onRotateRight={() => rotate(1)}
            onTogglePerspective={togglePerspective}
            onResetNorth={() => engine?.resetNorth()}
            onLocate={() => void locate()}
            onZoomIn={() => engine?.map.zoomIn({ duration: prefersReducedMotion() ? 0 : 350 })}
            onZoomOut={() => engine?.map.zoomOut({ duration: prefersReducedMotion() ? 0 : 350 })}
            onHome={explore}
          />
        </div>
      )}

      {/* Botón de directorio en móvil */}
      {!isDesktop && !selectedItem && !directoryOpen && (
        <div className="pb-safe pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
          <button
            onClick={() => setDirectoryOpen(true)}
            className="pointer-events-auto flex h-12 items-center gap-2 rounded-full bg-[#0b3b2e] pl-4 pr-3 text-sm font-bold text-white shadow-xl active:scale-95"
          >
            <Icon name="list" size={16} className="text-[#fbd567]" />
            {t('city.viewDirectory')}
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs text-[#fbd567]">{filtered.length}</span>
          </button>
        </div>
      )}

      {about && <AboutPanel onClose={() => setAbout(false)} studioHref={studioHref} ui={theme === 'noite' ? 'dark' : 'light'} />}
      {!ready && (
        <div className="fade pointer-events-none absolute inset-0 z-10 grid place-items-center bg-white/95">
          <div className="flex flex-col items-center gap-4">
            <LogoMark size={52} />
            <span className="text-[12px] font-extrabold tracking-[0.4em] text-[#0b3b2e]">{t('common.loadingMap')}</span>
          </div>
        </div>
      )}
      <Toast msg={toast.msg} />
    </div>
  );
}

/* ------------------------------------------------------------------ piezas */

interface SearchProps {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange(v: string): void;
  onPick(item: CityItem): void;
  suggestions: CityItem[];
  active: number;
  setActive(n: number): void;
  focused: boolean;
  onFocus(): void;
  onBlur(): void;
  placeholder: string;
  searchAria: string;
  clearAria: string;
  emptyText: string;
}

function CitySearch(p: SearchProps) {
  const open = p.focused && p.value.trim().length > 0;
  const pick = (item: CityItem) => {
    p.onPick(item);
    p.onBlur();
    p.inputRef.current?.blur();
  };
  return (
    <div className="relative" role="search">
      <div
        className={`flex h-11 items-center gap-2 rounded-2xl bg-white px-3.5 ring-1 ring-slate-200 transition-shadow ${
          p.focused ? 'shadow-lg shadow-[#0b3b2e]/10 ring-2 ring-[#127a4f]' : ''
        }`}
      >
        <Icon name="search" size={18} className="shrink-0 text-slate-400" />
        <input
          ref={p.inputRef}
          value={p.value}
          onChange={(e) => {
            p.onChange(e.target.value);
            p.setActive(0);
          }}
          onFocus={p.onFocus}
          onBlur={p.onBlur}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              p.setActive(Math.min(p.suggestions.length - 1, p.active + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              p.setActive(Math.max(0, p.active - 1));
            } else if (e.key === 'Enter' && p.suggestions[p.active]) {
              pick(p.suggestions[p.active]);
            } else if (e.key === 'Escape') {
              p.onChange('');
              p.inputRef.current?.blur();
            }
          }}
          placeholder={p.placeholder}
          aria-label={p.searchAria}
          role="combobox"
          aria-expanded={open}
          aria-controls="city-search-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={open && p.suggestions.length ? `city-search-option-${p.active}` : undefined}
          enterKeyHint="search"
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-slate-800 outline-none placeholder:text-slate-400"
        />
        {p.value && (
          <button
            onClick={() => p.onChange('')}
            className="grid h-11 w-11 place-items-center rounded-full text-slate-400 hover:bg-slate-100"
            aria-label={p.clearAria}
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {open && (
        <div className="rise absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
          {p.suggestions.length === 0 ? (
            <div className="px-4 py-5 text-center text-sm text-slate-500">{p.emptyText}</div>
          ) : (
            <ul id="city-search-suggestions" role="listbox" className="scroll-y max-h-[50vh] py-1.5">
              {p.suggestions.map((item, i) => (
                <li key={item.key} id={`city-search-option-${i}`} role="option" aria-selected={i === p.active}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(item)}
                    onMouseEnter={() => p.setActive(i)}
                    className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left ${i === p.active ? 'bg-[#effbf5]' : 'hover:bg-slate-50'}`}
                  >
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                      style={{ backgroundColor: `${item.color}22`, color: '#0b3b2e' }}
                    >
                      <Icon name={item.icon} size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800">{item.title}</span>
                      <span className="block truncate text-xs text-slate-500">{item.subtitle}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CityDirectory({
  items,
  selected,
  isDesktop,
  title,
  count,
  onPick,
  onClose,
  onClear,
}: {
  items: CityItem[];
  selected: WorldSelection | null;
  isDesktop: boolean;
  title: string;
  count: number;
  onPick(item: CityItem): void;
  onClose(): void;
  onClear(): void;
}) {
  const { t } = useI18n();
  return (
    <section
      className={`rise pointer-events-auto flex flex-col overflow-hidden bg-white/95 shadow-2xl shadow-slate-900/15 ring-1 ring-black/5 backdrop-blur-xl ${
        isDesktop ? 'h-full w-[330px] rounded-3xl' : 'pb-safe fixed inset-x-0 bottom-0 z-30 h-[62dvh] rounded-t-3xl'
      }`}
      aria-label={t('city.directory')}
    >
      {!isDesktop && (
        <div className="flex shrink-0 justify-center pt-2">
          <span className="h-1.5 w-11 rounded-full bg-slate-300" />
        </div>
      )}
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-extrabold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{t('city.items', { n: count })}</p>
        </div>
        <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full text-slate-500 hover:bg-slate-100" aria-label={t('common.close')}>
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="scroll-y flex-1 px-2 pb-3">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <Icon name="search" size={40} className="text-slate-300" />
            <p className="text-sm text-slate-500">{t('city.empty')}</p>
            <button onClick={onClear} className="rounded-xl bg-[#0b3b2e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f5132]">
              {t('city.clearFilters')}
            </button>
          </div>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => {
              const active = item.sel.kind === selected?.kind && item.key === selected?.id;
              return (
                <li key={item.key}>
                  <button
                    onClick={() => onPick(item)}
                    className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-colors ${
                      active ? 'bg-[#effbf5] ring-1 ring-[#127a4f]/40' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
                      style={{ backgroundColor: `${item.color}22`, color: '#0b3b2e' }}
                    >
                      <Icon name={item.icon} size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-slate-800">{item.title}</span>
                      <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                        {item.subtitle}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function CityCard({
  item,
  isDesktop,
  onClose,
  onOrbit,
  orbiting,
  canOrbit,
  onExplore,
}: {
  item: CityItem;
  isDesktop: boolean;
  onClose(): void;
  onOrbit(): void;
  orbiting: boolean;
  canOrbit: boolean;
  onExplore(): void;
}) {
  const { t } = useI18n();
  return (
    <aside
      className={`rise pointer-events-auto flex flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-black/5 ${
        isDesktop ? 'h-full w-[400px] rounded-3xl' : 'pb-safe fixed inset-x-0 bottom-0 z-30 h-[min(46dvh,400px)] rounded-t-3xl'
      }`}
      aria-label={item.title}
    >
      <div className="scroll-y flex-1 p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ backgroundColor: item.color }}>
            <Icon name={item.icon} size={14} /> {item.subtitle}
          </span>
          <button onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100" aria-label={t('common.close')}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <h2 className="mt-4 text-2xl font-extrabold leading-tight tracking-tight text-slate-900">{item.title}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{item.description ?? t('city.itemNote')}</p>
        {item.facts && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-600">{item.facts}</p>}
        {item.osmUrl && (
          <a
            href={item.osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-[12px] font-semibold text-[#0b3b2e] hover:bg-slate-50"
          >
            {t('about.openStreetMap')} <Icon name="external" size={14} />
          </a>
        )}
      </div>
      <div className="flex shrink-0 gap-2 border-t border-slate-100 bg-white/95 p-3">
        <button
          onClick={onOrbit}
          aria-pressed={canOrbit ? orbiting : undefined}
          className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-bold transition ${
            canOrbit && orbiting ? 'bg-[#0b3b2e] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Icon name={canOrbit ? 'rotate' : 'locate'} size={16} />
          {canOrbit ? (orbiting ? t('city.stopOrbit') : t('city.orbit')) : t('city.center')}
        </button>
        <button
          onClick={onExplore}
          className="flex h-12 flex-[1.6] items-center justify-center gap-2 rounded-2xl bg-[#0b3b2e] text-sm font-bold text-white shadow-lg"
        >
          <Icon name="home" size={16} className="text-[#fbd567]" /> {t('city.backExplore')}
        </button>
      </div>
    </aside>
  );
}

function CityControls({
  night,
  bearing,
  perspective3d,
  onToggleTheme,
  onRotateLeft,
  onRotateRight,
  onTogglePerspective,
  onResetNorth,
  onLocate,
  onZoomIn,
  onZoomOut,
  onHome,
}: {
  night: boolean;
  bearing: number;
  perspective3d: boolean;
  onToggleTheme(): void;
  onRotateLeft(): void;
  onRotateRight(): void;
  onTogglePerspective(): void;
  onResetNorth(): void;
  onLocate(): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onHome(): void;
}) {
  const { t } = useI18n();
  return (
    <div className="pointer-events-auto flex flex-col items-end gap-2">
      <Group>
        <Btn label={night ? t('world.themeToDay') : t('world.themeToNight')} onClick={onToggleTheme}>
          <Icon name={night ? 'sun' : 'moon'} size={18} className={night ? 'text-[#e0a106]' : ''} />
        </Btn>
      </Group>
      <Group>
        <Btn label={t('world.perspectiveAria')} onClick={onTogglePerspective} pressed={perspective3d}>
          <Icon name={perspective3d ? 'cube' : 'map'} size={18} />
        </Btn>
        <Btn label={`${t('world.resetNorth')} · ${bearing}°`} onClick={onResetNorth}>
          <span className="relative grid place-items-center">
            <Icon name="compass" size={20} />
            <span
              className="absolute -right-2 -top-1.5 text-[8px] font-extrabold leading-none"
              style={{ transform: `rotate(${-bearing}deg)` }}
              aria-hidden="true"
            >
              N
            </span>
          </span>
        </Btn>
        <Btn label={t('world.locateAria')} onClick={onLocate}>
          <Icon name="locate" size={18} />
        </Btn>
      </Group>
      <Group>
        <Btn label={t('city.rotateLeft')} onClick={onRotateLeft}>
          <Icon name="undo" size={18} />
        </Btn>
        <Btn label={t('city.rotateRight')} onClick={onRotateRight}>
          <Icon name="redo" size={18} />
        </Btn>
      </Group>
      <Group>
        <Btn label={t('city.zoomIn')} onClick={onZoomIn}>
          <Icon name="plus" size={20} />
        </Btn>
        <Btn label={t('city.zoomOut')} onClick={onZoomOut}>
          <span className="block h-0.5 w-4 rounded-full bg-current" aria-hidden="true" />
        </Btn>
      </Group>
      <Group>
        <Btn label={t('explore.home')} onClick={onHome}>
          <Icon name="home" size={18} />
        </Btn>
      </Group>
    </div>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div className="flex flex-col divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white/90 shadow-lg shadow-slate-900/10 ring-1 ring-black/5 backdrop-blur-md">{children}</div>;
}

function Btn({ label, onClick, children, pressed }: { label: string; onClick(): void; children: ReactNode; pressed?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className="grid h-11 w-11 place-items-center text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100"
    >
      {children}
    </button>
  );
}
