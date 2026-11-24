/**
 * Sistema orbital único de Tumeremo World, compartido por WORLD y por la vista previa
 * del STUDIO. El estado, el bucle, la guardia de gestos y el encuadre viven aquí:
 * ningún consumidor crea una segunda cámara orbital.
 *
 * Las coordenadas, la geometría y los estilos no se tocan: solo se mueve la cámara
 * con los valores efectivos de `resolveAnimation` (generales + override individual).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveAnimation } from '../../core/animation';
import { computeFocusView } from '../../core/camera';
import { clamp, normalizeDegrees } from '../../core/geo';
import type { Entity3D, EntityRef, LngLat, WorldDocument, WorldSelection } from '../../core/types';
import { prefersReducedMotion, type WorldEngine } from '../../engine/WorldEngine';

export interface OrbitTarget {
  entity: Entity3D;
  position: LngLat;
}

/** Referencia seleccionable desde WORLD (WorldSelection) o desde STUDIO (EntityRef). */
type CameraRef = EntityRef | WorldSelection;

/** Posición de cualquier selección, incluidos los objetos 3D que el STUDIO puede orbitar. */
export function selectionPoint(doc: WorldDocument, ref: CameraRef): LngLat | null {
  if (ref.kind === 'place') return doc.places?.find((p) => p.id === ref.id)?.position ?? null;
  if (ref.kind === 'object') return doc.objects.find((o) => o.id === ref.id)?.placement.position ?? null;
  if (ref.kind === 'building') return doc.buildings.find((b) => b.id === ref.id)?.placement.position ?? null;
  const business = doc.businesses.find((b) => b.id === ref.id);
  return doc.buildings.find((b) => b.id === business?.buildingId)?.placement.position ?? null;
}

/** Construcción 3D y su posición. Los Puntos no tienen geometría y devuelven null. */
export function resolveOrbitTarget(doc: WorldDocument, ref: CameraRef): OrbitTarget | null {
  if (ref.kind === 'place') return null;
  const entity =
    ref.kind === 'object'
      ? doc.objects.find((o) => o.id === ref.id)
      : ref.kind === 'building'
        ? doc.buildings.find((b) => b.id === ref.id)
        : doc.buildings.find((b) => b.id === doc.businesses.find((biz) => biz.id === ref.id)?.buildingId);
  return entity ? { entity, position: entity.placement.position } : null;
}

type FocusOptions = { skipOffset?: boolean; orbit?: { zoom: number; pitch: number; bearing: number } };

export function useWorldCamera(engine: WorldEngine | null, doc: WorldDocument, isDesktop: boolean) {
  const focusTimers = useRef<number[]>([]);
  const flyingRef = useRef(false);
  const [orbiting, setOrbiting] = useState(false);
  const orbitRaf = useRef<number | null>(null);
  const orbitRequested = useRef(false);
  const orbitPrevMaxZoom = useRef<number | null>(null);

  useEffect(
    () => () => {
      orbitRequested.current = false;
      if (orbitRaf.current !== null) cancelAnimationFrame(orbitRaf.current);
    },
    [],
  );

  /** Mismo relleno para enfoque y órbita: el objetivo no salta de sitio al girar. */
  const paddingFor = useCallback(
    () => ({ top: 0, bottom: isDesktop ? 0 : Math.round(window.innerHeight * 0.32), left: 0, right: 0 }),
    [isDesktop],
  );

  /** Solo limpia nuestros temporizadores; no toca los handlers nativos de MapLibre. */
  const clearFocusTimers = useCallback(() => {
    if (focusTimers.current.length) {
      focusTimers.current.forEach((id) => window.clearTimeout(id));
      focusTimers.current = [];
    }
    flyingRef.current = false;
  }, []);

  /** Cancela cualquier acercamiento automático en curso (like `CameraRig.tween = null`). */
  const cancelFocus = useCallback(() => {
    clearFocusTimers();
    engine?.map.stop();
  }, [engine, clearFocusTimers]);

  /** Detiene la órbita sin tocar la selección ni la ficha: el usuario recupera el control manual. */
  const stopOrbit = useCallback(() => {
    orbitRequested.current = false;
    if (orbitRaf.current !== null) {
      cancelAnimationFrame(orbitRaf.current);
      orbitRaf.current = null;
    }
    engine?.pinSelectionPulse(false);
    if (engine && orbitPrevMaxZoom.current !== null) {
      engine.map.setMaxZoom(orbitPrevMaxZoom.current);
      orbitPrevMaxZoom.current = null;
    }
    clearFocusTimers();
    setOrbiting(false);
  }, [engine, clearFocusTimers]);

  // Desmontar o cambiar de motor libera el pulso fijado y el zoom temporal.
  useEffect(
    () => () => {
      engine?.pinSelectionPulse(false);
      if (orbitPrevMaxZoom.current !== null) engine?.map.setMaxZoom(orbitPrevMaxZoom.current);
    },
    [engine],
  );

  /**
   * Cualquier gesto del usuario interrumpe el movimiento automático de la cámara.
   * Los eventos programáticos llegan sin `originalEvent`: solo los gestos reales
   * interrumpen la órbita o el vuelo (`map.stop()` en `dragstart` reiniciaría el gesto).
   */
  useEffect(() => {
    if (!engine) return;
    const stopFlight = () => {
      engine.map.stop();
      stopOrbit();
      clearFocusTimers();
    };
    const stopTimers = (e?: { originalEvent?: unknown }) => {
      if (!e?.originalEvent) return;
      stopOrbit();
      clearFocusTimers();
    };
    const early = ['touchstart', 'mousedown', 'wheel', 'dblclick'] as const;
    const deferred = ['dragstart', 'rotatestart', 'pitchstart'] as const;
    for (const ev of early) engine.map.on(ev, stopFlight);
    for (const ev of deferred) engine.map.on(ev, stopTimers);
    return () => {
      for (const ev of early) engine.map.off(ev, stopFlight);
      for (const ev of deferred) engine.map.off(ev, stopTimers);
    };
  }, [engine, clearFocusTimers, stopOrbit]);

  /**
   * Encuadre inspirado en `CityScene.focus()`: distancia = clamp(20 + altura*1.7 +
   * huella*1.3, 28, 62) (+8 en móvil). En MapLibre la distancia se traduce a zoom y el
   * azimut a bearing; el punto de vista final sale de `focus.bearingOffset` (configurable).
   */
  const focusOn = useCallback(
    (ref: CameraRef, onDone?: () => void, opts?: FocusOptions) => {
      if (!engine) return;
      cancelFocus();
      const p = selectionPoint(doc, ref);
      if (!p) return;
      // Un único cálculo de encuadre compartido con WORLD y con la vista previa del STUDIO.
      const view = computeFocusView({
        doc,
        ref,
        current: { zoom: engine.map.getZoom(), pitch: engine.map.getPitch(), bearing: engine.map.getBearing() },
        paddingBottom: paddingFor().bottom,
      });
      if (!view) return;

      engine.map.setMaxZoom(opts?.orbit ? Math.max(engine.map.getMaxZoom(), 22) : 21);
      flyingRef.current = true;
      const offsetY: [number, number] = [0, opts?.skipOffset || isDesktop ? 0 : -Math.round(window.innerHeight * 0.2)];
      const finish = () => {
        flyingRef.current = false;
        focusTimers.current = [];
        onDone?.();
      };
      const commit = () => {
        if (!flyingRef.current) return;
        if (prefersReducedMotion()) {
          engine.map.jumpTo({
            center: view.center,
            zoom: opts?.orbit?.zoom ?? view.zoom,
            pitch: opts?.orbit?.pitch ?? view.pitch,
            bearing: opts?.orbit?.bearing ?? view.bearing,
            padding: view.padding,
          });
          finish();
          return;
        }
        engine.map.flyTo({
          center: view.center,
          zoom: opts?.orbit?.zoom ?? view.zoom,
          pitch: opts?.orbit?.pitch ?? view.pitch,
          bearing: opts?.orbit?.bearing ?? view.bearing,
          padding: view.padding,
          offset: offsetY,
          duration: view.duration,
          curve: 1.2,
          essential: true,
        });
        focusTimers.current.push(window.setTimeout(finish, view.duration + 50));
      };

      if (prefersReducedMotion()) {
        commit();
        return;
      }
      // Aproximación progresiva y encuadre final, como en el WORLD público.
      engine.flyToPoint(p, Math.min(engine.map.getZoom() + 1.2, view.zoom - 1.1));
      focusTimers.current.push(window.setTimeout(commit, 650));
    },
    [cancelFocus, doc, engine, isDesktop, paddingFor],
  );

  /** Alterna una vuelta cinematográfica completa alrededor de la construcción seleccionada. */
  const startOrbit = useCallback(
    (ref: CameraRef) => {
      if (!engine) return;
      const target = resolveOrbitTarget(doc, ref);
      if (!target) {
        stopOrbit();
        const p = selectionPoint(doc, ref);
        if (!p) return;
        const view = { center: [p.lng, p.lat] as [number, number], zoom: Math.max(engine.map.getZoom(), 17.6) };
        if (prefersReducedMotion()) engine.map.jumpTo(view);
        else engine.map.flyTo({ ...view, duration: 900 });
        return;
      }
      if (orbiting) {
        stopOrbit();
        return;
      }
      stopOrbit();
      const ent = target.entity;
      const p = target.position;
      const padding = paddingFor();

      const anim = resolveAnimation(doc.animation, ent.animation);
      // Radio y altura derivados de la huella y la altura reales del modelo.
      const width = ent.params.width * ent.placement.scale;
      const depth = ent.params.depth * ent.placement.scale;
      const height = ent.params.height * ent.placement.scale;
      const radius = clamp(2 * Math.max(width, depth), 10, 18);
      const altitude = clamp(1.2 * height + 4, 9, 15) * anim.orbit.altitudeScale;
      const rise = altitude - height / 2;
      const pitch = clamp((Math.atan2(radius, rise) * 180) / Math.PI, 25, 60);
      // En MapLibre la cámara está a 1.5 · alto · m/px; el zoom máximo limita la cercanía.
      const cameraPx = 1.5 * Math.max(320, window.innerHeight);
      const metersAtZoom0 = 78271.516 * Math.cos((p.lat * Math.PI) / 180);
      const closest = (cameraPx * metersAtZoom0) / 2 ** 22;
      // La distancia efectiva baja el zoom: zoom 22 − log2(1.25) ≈ 21.68 con el valor inicial.
      // `closest` ya fija la distancia mínima segura; el multiplicador solo aleja.
      const distance = Math.max(Math.hypot(radius, rise), closest) * anim.orbit.distanceScale;
      // Suelo = minZoom real del mapa: 50×/100× no piden un zoom que el motor recortaría.
      const zoom = clamp(Math.log2(metersAtZoom0 / (distance / cameraPx)), engine.map.getMinZoom(), 22);
      // La órbita arranca y cierra en el mismo punto de vista que el enfoque configurable.
      const beta0 = normalizeDegrees(ent.placement.heading + anim.focus.bearingOffset);
      const durationMs = anim.orbit.durationMs;

      orbitPrevMaxZoom.current = engine.map.getMaxZoom();
      orbitRequested.current = true;
      setOrbiting(true);
      // El pulso sigue a la construcción 3D, también cuando la ficha es un comercio.
      engine.setSelection({ kind: ent.kind, id: ent.id });
      engine.pinSelectionPulse(true);

      focusOn(
        ref,
        () => {
          if (!orbitRequested.current) return;
          // Con movimiento reducido no se gira: se muestra directamente el último fotograma.
          if (prefersReducedMotion()) {
            engine.map.jumpTo({ center: [p.lng, p.lat], zoom, pitch, bearing: beta0, padding });
            stopOrbit();
            return;
          }
          const map = engine.map;
          const t0 = performance.now();
          const tick = (now: number) => {
            if (!orbitRequested.current) return;
            // Ángulo absoluto según el tiempo: 360° exactos aunque se pierdan frames.
            const tau = Math.min(1, (now - t0) / durationMs);
            const eased = (1 - Math.cos(Math.PI * tau)) / 2;
            const bearing = beta0 + 360 * eased;
            map.jumpTo({ center: [p.lng, p.lat], zoom, pitch, bearing, padding });
            if (tau < 1) {
              orbitRaf.current = requestAnimationFrame(tick);
            } else {
              stopOrbit(); // β(1) ≡ β0: la vuelta se cierra sin salto
            }
          };
          orbitRaf.current = requestAnimationFrame(tick);
        },
        { skipOffset: true, orbit: { zoom, pitch, bearing: beta0 } },
      );
    },
    [doc, engine, focusOn, orbiting, stopOrbit, paddingFor],
  );

  return { focusOn, startOrbit, stopOrbit, cancelFocus, orbiting };
}
