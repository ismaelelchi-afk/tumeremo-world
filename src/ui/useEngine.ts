import { useEffect, useRef, useState } from 'react';
import visualJson from '../data/visual.json';
import { SEED_PLACES } from '../core/repository';
import type { CameraView, VisualConfig } from '../core/types';
import { WorldEngine, type EngineCallbacks } from '../engine/WorldEngine';

export const VISUAL = visualJson as unknown as VisualConfig;
/** Valor inicial del motor; la fuente verdadera es `doc.places` (ver `WorldEngine.setData`). */
export const PLACES = SEED_PLACES;

/** Cria/destrói o motor ligado a um <div>. Os callbacks são lidos sempre da versão mais recente. */
export function useEngine(mode: 'world' | 'studio', theme: string, callbacks: EngineCallbacks, initialView?: CameraView) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(callbacks);
  cb.current = callbacks;
  const themeRef = useRef(theme);
  const [engine, setEngine] = useState<WorldEngine | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const e = new WorldEngine({
      container: ref.current,
      mode,
      visual: VISUAL,
      theme: themeRef.current,
      places: PLACES,
      initialView,
      callbacks: {
        onPick: (h) => cb.current.onPick(h),
        onView: (v) => cb.current.onView(v),
        onReady: () => {
          setReady(true);
          cb.current.onReady();
        },
        onMapError: () => cb.current.onMapError(),
        onTransform: (r, p) => cb.current.onTransform(r, p),
        onGestureEnd: () => cb.current.onGestureEnd(),
      },
    });
    setEngine(e);
    return () => {
      setReady(false);
      setEngine(null);
      e.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    themeRef.current = theme;
    engine?.setTheme(theme);
  }, [engine, theme]);

  return { ref, engine, ready };
}
