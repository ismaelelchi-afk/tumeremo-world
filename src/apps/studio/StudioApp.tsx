import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeDegrees } from '../../core/geo';
import { exportDocumentJson, importDocumentJson } from '../../data/customModels';
import { documentStore, useDocumentState } from '../../core/store';
import type { Business, CameraView, EntityRef, ModelDef, ModelParams, WorldDocument } from '../../core/types';
import { getModel } from '../../data/models';
import type { EditTool } from '../../engine/WorldEngine';
import { localizedText, useI18n, type TranslationKey } from '../../i18n';
import { Icon, LogoMark, type IconName } from '../../ui/Icon';
import { LanguageSwitch } from '../../ui/LanguageSwitch';
import { Toast, useToast } from '../../ui/Toast';
import { VISUAL, useEngine } from '../../ui/useEngine';
import { WorldApp } from '../world/WorldApp';
import { BusinessTab } from './BusinessTab';
import {
  addEntity,
  createBusiness,
  createEntity,
  duplicateEntity,
  findEntity,
  findPlace,
  patchBusiness,
  patchEntity,
  patchPlace,
  removeBusiness,
  removeEntity,
} from './docOps';
import { LibraryTab } from './LibraryTab';
import { PlacesTab } from './PlacesTab';
import { PropsTab } from './PropsTab';
import { SceneTab } from './SceneTab';

type Tab = 'library' | 'scene' | 'points' | 'business' | 'props';

const STUDIO_VIEW: CameraView = { ...VISUAL.home, zoom: 17.4, pitch: 45 };

/** STUDIO = editor + pré-visualização. A prévia monta o WORLD real com o mesmo documento. */
export function StudioApp() {
  const [previewing, setPreviewing] = useState(false);
  const viewRef = useRef<CameraView>(STUDIO_VIEW);
  if (previewing) {
    return <WorldApp preview={{ onExit: () => setPreviewing(false), initialView: viewRef.current }} />;
  }
  return (
    <StudioEditor
      initialView={viewRef.current}
      onPreview={(v) => {
        viewRef.current = v;
        setPreviewing(true);
      }}
    />
  );
}

const TABS: Array<[Tab, TranslationKey, IconName]> = [
  ['library', 'studio.library', 'layers'],
  ['scene', 'studio.scene', 'list'],
  ['points', 'studio.points', 'pin'],
  ['business', 'studio.business', 'store'],
  ['props', 'studio.props', 'sliders'],
];

const TOOLS: Array<[EditTool, TranslationKey, IconName, TranslationKey]> = [
  ['select', 'studio.tool.select', 'pointer', 'studio.tool.selectHint'],
  ['move', 'studio.tool.move', 'move', 'studio.tool.moveHint'],
  ['rotate', 'studio.tool.rotate', 'rotate', 'studio.tool.rotateHint'],
  ['scale', 'studio.tool.scale', 'scale', 'studio.tool.scaleHint'],
];

function StudioEditor({ initialView, onPreview }: { initialView: CameraView; onPreview: (v: CameraView) => void }) {
  const state = useDocumentState();
  const doc = state.doc;
  const toast = useToast();
  const { lang, t, formatTime } = useI18n();
  const [sel, setSel] = useState<EntityRef | null>(null);
  const [placeSel, setPlaceSel] = useState<string | null>(null);
  const [tool, setTool] = useState<EditTool>('move');
  const [tab, setTab] = useState<Tab>('library');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingBiz, setEditingBiz] = useState<string | null>(null);
  const [theme, setTheme] = useState('dia');
  const [bearing, setBearing] = useState(0);
  const [pitch, setPitch] = useState(initialView.pitch);
  const [menu, setMenu] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    documentStore.autosave = true;
    return () => {
      documentStore.autosave = false;
    };
  }, []);

  const update = useCallback((fn: (d: WorldDocument) => WorldDocument, key?: string) => documentStore.update(fn, key), []);

  const { ref, engine, ready } = useEngine(
    'studio',
    theme,
    {
      onPick: (hit) => {
        if (!hit) {
          setPlaceSel(null);
          setSel(null);
          return;
        }
        if (hit.kind === 'place') {
          setSel(null);
          setPlaceSel(hit.id);
          setTab('points');
          setSheetOpen(true);
          return;
        }
        setPlaceSel(null);
        select({ kind: hit.kind, id: hit.id });
      },
      onView: (v) => {
        setBearing(v.bearing);
        setPitch(v.pitch);
      },
      onReady: () => {},
      onMapError: () => toast.show(t('world.mapError'), 6000),
      onTransform: (r, patch) => update((d) => patchEntity(d, r, { placement: patch }), `drag:${r.id}`),
      onGestureEnd: () => documentStore.breakCoalesce(),
    },
    initialView,
  );

  useEffect(() => {
    engine?.setData(doc, { showUnpublished: true });
  }, [engine, doc]);
  useEffect(
    () => engine?.setSelection(sel ? { kind: sel.kind, id: sel.id } : placeSel ? { kind: 'place', id: placeSel } : null),
    [engine, sel, placeSel],
  );
  useEffect(() => engine?.setTool(tool), [engine, tool]);

  // seleção removida (excluir/desfazer)
  useEffect(() => {
    if (sel && !findEntity(doc, sel)) setSel(null);
    if (placeSel && !findPlace(doc, placeSel)) setPlaceSel(null);
  }, [doc, sel, placeSel]);

  const select = useCallback((r: EntityRef | null) => {
    setPlaceSel(null);
    setSel(r);
    if (r) {
      setTab('props');
      setSheetOpen(true);
    }
  }, []);

  const entity = sel ? findEntity(doc, sel) : undefined;

  /* ---------------------------------- ações ---------------------------------- */

  const addModel = (m: ModelDef) => {
    if (!engine) return;
    const heading = Math.round(normalizeDegrees(engine.map.getBearing() + 180));
    const e = createEntity(m, engine.getCenter(), heading);
    update((d) => addEntity(d, e));
    setPlaceSel(null);
    setSel({ kind: e.kind, id: e.id });
    setTab('props');
    if (tool === 'select') setTool('move');
    toast.show(t('studio.added', { name: localizedText(m, 'name', lang) }));
  };

  const deleteSelected = useCallback(() => {
    if (!sel) return;
    update((d) => removeEntity(d, sel));
    setSel(null);
    toast.show(t('studio.removed'));
  }, [sel, update, toast, t]);

  const duplicateSelected = useCallback(() => {
    if (!sel) return;
    const r = duplicateEntity(documentStore.getState().doc, sel);
    if (!r) return;
    update(() => r.doc);
    setSel(r.ref);
  }, [sel, update]);

  const alignSelected = () => {
    if (!sel || !engine) return;
    const h = engine.alignToNearestRoad(sel.id);
    if (h === null) return toast.show(t('studio.noRoad'), 4200);
    update((d) => patchEntity(d, sel, { placement: { heading: h } }));
    toast.show(t('studio.aligned'));
  };

  const swapModel = (modelId: string) => {
    if (!sel || !entity) return;
    const next = getModel(modelId);
    const prev = getModel(entity.modelId);
    if (!next) return;
    const nextName = localizedText(next, 'name', lang);
    const prevName = prev ? localizedText(prev, 'name', lang) : undefined;
    update((d) =>
      patchEntity(d, sel, {
        modelId,
        params: { ...next.defaults },
        ...(localizedText(entity, 'name', lang) === prevName ? { name: nextName } : {}),
      }),
    );
  };

  const createBiz = (buildingId: string | null) => {
    const b = createBusiness(buildingId);
    update((d) => ({ ...d, businesses: [...d.businesses, b] }));
    setEditingBiz(b.id);
    setTab('business');
    setSheetOpen(true);
  };

  const showBuilding = (id: string) => {
    const b = doc.buildings.find((x) => x.id === id);
    if (!b) return;
    setSel({ kind: 'building', id });
    engine?.flyToPoint(b.placement.position, 18);
  };

  /* ---------------------------------- arquivo ---------------------------------- */

  const exportJson = async () => {
    try {
      const json = await exportDocumentJson(documentStore.getState().doc);
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      a.download = `tumeremo-world-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.show(t('studio.exportError'), 4500);
    }
    setMenu(false);
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const result = await importDocumentJson(await file.text());
      if (!result.doc) throw new Error('inválido');
      documentStore.replace(result.doc);
      setSel(null);
      const extras: string[] = [];
      if (result.imported) extras.push(t('studio.importModels', { n: result.imported }));
      if (result.reused) extras.push(t('studio.importReused', { n: result.reused }));
      if (result.skipped) extras.push(t('studio.importSkipped', { n: result.skipped }));
      toast.show(
        t('studio.imported', {
          buildings: result.doc.buildings.length,
          objects: result.doc.objects.length,
          businesses: result.doc.businesses.length,
          places: result.doc.places?.length ?? 0,
          extras: extras.length ? ` ${extras.join(' · ')}.` : '',
        }),
        5000,
      );
    } catch {
      toast.show(t('studio.importInvalid'), 4500);
    }
    if (fileInput.current) fileInput.current.value = '';
    setMenu(false);
  };

  const restoreOriginal = async () => {
    setMenu(false);
    if (!window.confirm(t('studio.restoreConfirm'))) return;
    await documentStore.discardDraft();
    setSel(null);
    toast.show(t('studio.restored'));
  };

  /* ---------------------------------- teclado ---------------------------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) documentStore.redo();
        else documentStore.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        documentStore.redo();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel) {
          e.preventDefault();
          deleteSelected();
        }
      } else if (e.key === 'Escape') setSel(null);
      else if (!mod) {
        const k = e.key.toLowerCase();
        if (k === 'v') setTool('select');
        else if (k === 'm') setTool('move');
        else if (k === 'r') setTool('rotate');
        else if (k === 'e') setTool('scale');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, deleteSelected, duplicateSelected]);

  /* ---------------------------------- render ---------------------------------- */

  const ui = VISUAL.themes[theme].ui;
  const is3d = pitch > 12;
  const worldUrl = location.pathname.replace(/studio\.html$/, 'index.html');
  const saveLabel = state.saving
    ? t('studio.saving')
    : state.savedAt
      ? t('studio.saved', { time: formatTime(state.savedAt) })
      : state.hasDraft
        ? t('studio.draftLoaded')
        : t('studio.originalNoEdits');
  const hintKey = TOOLS.find((x) => x[0] === tool)![3];

  const onTab = (t: Tab) => {
    if (t === tab) setSheetOpen((o) => !o);
    else {
      setTab(t);
      setSheetOpen(true);
    }
  };

  return (
    <div className="app-root" data-ui={ui} style={{ ['--sheet-h' as string]: `calc(${sheetOpen ? 'min(52dvh, 470px)' : '0px'} + 56px)` }}>
      <div ref={ref} className="absolute inset-0" />

      {/* barra superior */}
      <header
        className="glass fixed inset-x-2 z-30 flex h-[52px] items-center gap-1.5 rounded-full pl-3 pr-1.5 md:right-[392px]"
        style={{ top: 'calc(var(--safe-t) + 8px)' }}
      >
        <LogoMark size={24} />
        <div className="mr-auto min-w-0 leading-none">
          <span className="block text-[12.5px] font-extrabold tracking-[0.18em]">
            STUDIO <span style={{ color: 'var(--accent)' }}>·</span> TUMEREMO
          </span>
          <span className="block max-w-[44vw] truncate pt-[3px] text-[10.5px] md:max-w-none" style={{ color: 'var(--muted)' }}>
            {saveLabel}
          </span>
        </div>
        <LanguageSwitch compact />
        <button className="fab !h-10 !w-10" onClick={() => documentStore.undo()} disabled={!state.past.length} style={{ opacity: state.past.length ? 1 : 0.35 }} aria-label={t('common.undo')} title={t('common.undoTitle')}>
          <Icon name="undo" size={19} />
        </button>
        <button className="fab !h-10 !w-10" onClick={() => documentStore.redo()} disabled={!state.future.length} style={{ opacity: state.future.length ? 1 : 0.35 }} aria-label={t('common.redo')} title={t('common.redoTitle')}>
          <Icon name="redo" size={19} />
        </button>
        <button className="btn btn-primary !min-h-[40px] !rounded-full" onClick={() => engine && onPreview(engine.getView())}>
          <Icon name="play" size={16} /> <span className="hidden sm:inline">{t('studio.preview')}</span>
          <span className="sm:hidden">{t('studio.previewShort')}</span>
        </button>
        <div className="relative">
          <button className="fab !h-10 !w-10" onClick={() => setMenu((m) => !m)} aria-label={t('studio.menuAria')} aria-expanded={menu}>
            <Icon name="menu" size={20} />
          </button>
          {menu && (
            <>
              <button className="fixed inset-0 z-40 cursor-default" onClick={() => setMenu(false)} aria-label={t('studio.menuClose')} />
              <div className="glass rise absolute right-0 top-12 z-50 w-[250px] rounded-2xl p-1.5" style={{ background: 'var(--panel-solid)' }}>
                <MenuItem icon="save" label={t('studio.menuSave')} onClick={() => void documentStore.saveNow().then(() => { toast.show(t('studio.toastSaved')); setMenu(false); })} />
                <MenuItem icon="download" label={t('studio.menuExport')} onClick={exportJson} />
                <MenuItem icon="upload" label={t('studio.menuImport')} onClick={() => fileInput.current?.click()} />
                <MenuItem icon={theme === 'dia' ? 'moon' : 'sun'} label={theme === 'dia' ? t('studio.menuNight') : t('studio.menuDay')} onClick={() => { setTheme(theme === 'dia' ? 'noite' : 'dia'); setMenu(false); }} />
                <a className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-[13.5px] font-semibold hover:bg-white/5" href={worldUrl} target="_blank" rel="noopener noreferrer">
                  <Icon name="external" size={18} /> {t('studio.menuOpenWorld')}
                </a>
                <MenuItem icon="trash" label={t('studio.menuRestore')} danger onClick={() => void restoreOriginal()} />
              </div>
            </>
          )}
          <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void importJson(e.target.files?.[0])} />
        </div>
      </header>

      {/* ferramentas */}
      <div className="studio-dock flex flex-col items-center gap-2">
        <span className="glass max-w-[88vw] rounded-full px-3 py-1 text-center text-[11.5px]" style={{ color: 'var(--muted)' }}>
          {sel || tool === 'select' ? t(hintKey) : t('studio.tapSelect')}
        </span>
        <div className="glass flex items-center gap-1 rounded-full p-1" role="toolbar" aria-label={t('studio.toolsAria')}>
          {TOOLS.map(([id, labelKey, icon]) => (
            <button key={id} className="fab !h-11 !w-11" data-on={tool === id} onClick={() => setTool(id)} aria-label={t(labelKey)} aria-pressed={tool === id} title={t(labelKey)}>
              <Icon name={icon} size={20} />
            </button>
          ))}
          <span className="mx-1 h-6 w-px" style={{ background: 'var(--border)' }} />
          <button className="fab !h-11 !w-11 text-[12px] font-extrabold" data-on={is3d} onClick={() => engine?.setPerspective(is3d ? '2d' : '3d')} aria-label={is3d ? t('studio.to2d') : t('studio.to3d')}>
            {is3d ? '3D' : '2D'}
          </button>
          <button className="fab !h-11 !w-11" onClick={() => engine?.resetNorth()} aria-label={t('world.resetNorth')}>
            <svg width="22" height="22" viewBox="0 0 40 40" style={{ transform: `rotate(${-bearing}deg)` }} aria-hidden>
              <path d="M20 4 26 22H14Z" fill="#ff6b5e" />
              <path d="M20 36 14 22H26Z" fill="currentColor" opacity="0.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* painel: coluna à direita (desktop) / folha inferior (celular) */}
      <aside
        data-open={sheetOpen}
        className="studio-sheet glass fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[26px] md:inset-x-auto md:bottom-3 md:right-3 md:top-[68px] md:w-[372px] md:rounded-[24px]"
        style={{ paddingBottom: 'var(--safe-b)' }}
      >
        <div role="tablist" className="flex h-[56px] shrink-0 items-stretch gap-1 px-2 pt-1">
          {TABS.map(([id, labelKey, icon]) => {
            const on = tab === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={on}
                onClick={() => onTab(id)}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-[10.5px] font-bold transition-colors"
                style={on ? { background: 'color-mix(in srgb, var(--accent) 22%, transparent)', color: 'var(--fg)' } : { color: 'var(--muted)' }}
              >
                <Icon name={icon} size={19} />
                {t(labelKey)}
              </button>
            );
          })}
        </div>
        <div className={`scroll-y min-h-0 flex-1 px-4 pb-6 pt-3 ${sheetOpen ? 'block' : 'hidden md:block'}`}>
          <div>
            {tab === 'library' && <LibraryTab onAdd={addModel} />}
            {tab === 'scene' && (
              <SceneTab
                doc={doc}
                selected={sel}
                onSelect={(r) => {
                  const e = findEntity(doc, r);
                  setSel(r);
                  if (e) engine?.flyToPoint(e.placement.position, 18);
                }}
                onToggleVisible={(r, v) => update((d) => patchEntity(d, r, { visible: v }))}
              />
            )}
            {tab === 'points' && (
              <PlacesTab
                doc={doc}
                editingId={placeSel}
                onEdit={setPlaceSel}
                onPatch={(id, patch) => update((d) => patchPlace(d, id, patch), `plc:${id}:${Object.keys(patch).join(',')}`)}
                onShowPlace={(id) => {
                  const p = findPlace(doc, id);
                  if (p) engine?.flyToPoint(p.position, 18);
                }}
              />
            )}
            {tab === 'business' && (
              <BusinessTab
                doc={doc}
                editingId={editingBiz}
                onEdit={setEditingBiz}
                onCreate={() => createBiz(sel?.kind === 'building' ? sel.id : null)}
                onPatch={(id, patch: Partial<Business>) => update((d) => patchBusiness(d, id, patch), `biz:${id}:${Object.keys(patch)[0]}`)}
                onRemove={(id) => {
                  update((d) => removeBusiness(d, id));
                  setEditingBiz(null);
                }}
                onShowBuilding={showBuilding}
              />
            )}
            {tab === 'props' && (
              <PropsTab
                doc={doc}
                entity={entity}
                onPatch={(patch, key) => sel && update((d) => patchEntity(d, sel, patch), key)}
                onParams={(patch: Partial<ModelParams>, key) => sel && update((d) => patchEntity(d, sel, { params: patch as ModelParams }), key)}
                onPlacement={(patch, key) => sel && update((d) => patchEntity(d, sel, { placement: patch }), key)}
                onSwapModel={swapModel}
                onAlign={alignSelected}
                onDuplicate={duplicateSelected}
                onDelete={deleteSelected}
                onLinkBusiness={(id, bid) => update((d) => patchBusiness(d, id, { buildingId: bid }))}
                onCreateBusiness={(bid) => createBiz(bid)}
                onOpenBusiness={(id) => {
                  setEditingBiz(id);
                  setTab('business');
                }}
              />
            )}
          </div>
        </div>
      </aside>

      {!ready && (
        <div className="fade pointer-events-none fixed inset-0 z-10 grid place-items-center" style={{ background: '#0a1014' }}>
          <div className="flex flex-col items-center gap-4">
            <LogoMark size={52} />
            <span className="text-[12px] font-bold tracking-[0.4em]" style={{ color: '#8da0ab' }}>
              {t('common.openingStudio')}
            </span>
          </div>
        </div>
      )}
      <Toast msg={toast.msg} />
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: IconName; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-[13.5px] font-semibold hover:bg-white/5" style={danger ? { color: 'var(--danger)' } : undefined} onClick={onClick}>
      <Icon name={icon} size={18} /> {label}
    </button>
  );
}
