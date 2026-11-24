import {
  ANIMATION_LIMITS,
  hasAnimationOverrides,
  resolveAnimation,
  type AnimationOverrides,
  type WorldAnimationConfig,
} from '../../core/animation';
import type { Entity3D, Place, WorldDocument } from '../../core/types';
import { localizedText, useI18n } from '../../i18n';
import { Icon } from '../../ui/Icon';
import { Field, Slider } from './fields';

type Section = 'orbit' | 'focus';
type Setter = (section: Section, key: string, value: number) => void;

interface Props {
  doc: WorldDocument;
  entity: Entity3D | undefined;
  place: Place | undefined;
  onClose: () => void;
  onGeneral: (config: WorldAnimationConfig, key: string) => void;
  onEntity: (overrides: AnimationOverrides | undefined, key: string) => void;
  onPlace: (overrides: AnimationOverrides | undefined, key: string) => void;
}

/**
 * Panel de animaciones de STUDIO. No añade pestaña: se abre desde la cabecera.
 * La parte «General» edita los defaults del documento; la parte «Individual» edita
 * solo los campos que se cambian, dejando el resto heredado.
 */
export function AnimationPanel(p: Props) {
  const { lang, t } = useI18n();
  const general = p.doc.animation ?? resolveAnimation(undefined);
  const overrides = p.entity?.animation ?? p.place?.animation;
  const isPlace = !!p.place && !p.entity;
  const selected = p.entity ?? p.place;
  const name = selected ? localizedText(selected, 'name', lang) : '';
  const effective = resolveAnimation(general, overrides);
  const customized = hasAnimationOverrides(overrides);

  const commit = (next: AnimationOverrides | undefined, key: string) => {
    if (p.entity) p.onEntity(next, `anim:entity:${key}`);
    else if (p.place) p.onPlace(next, `anim:place:${key}`);
  };

  const setGeneral: Setter = (section, key, value) => {
    const next = {
      ...general,
      [section]: { ...general[section], [key]: value },
    } as WorldAnimationConfig;
    p.onGeneral(next, `anim:general:${key}`);
  };

  const setOverride: Setter = (section, key, value) => {
    const base = overrides ?? {};
    commit(
      {
        ...base,
        [section]: { ...(base[section] ?? {}), [key]: value },
      } as AnimationOverrides,
      key,
    );
  };

  const controls = (cfg: WorldAnimationConfig, set: Setter, withOrbit: boolean) => {
    const speedSeconds = cfg.orbit.durationMs / 1000;
    const speed = [20, 12, 7].includes(speedSeconds) ? String(speedSeconds) : 'custom';
    const facades = [180, 0, 90, -90];
    const facade = facades.includes(cfg.focus.bearingOffset) ? String(cfg.focus.bearingOffset) : 'custom';
    return (
      <>
        {withOrbit && (
          <section className="space-y-3">
            <h4 className="label !mb-0">{t('anim.orbit.section')}</h4>
            <Slider
              label={t('anim.orbit.distance')}
              value={cfg.orbit.distanceScale}
              min={ANIMATION_LIMITS.orbit.distanceScale[0]}
              max={ANIMATION_LIMITS.orbit.distanceScale[1]}
              step={0.05}
              unit="×"
              onChange={(v) => set('orbit', 'distanceScale', v)}
            />
            <Slider
              label={t('anim.orbit.altitude')}
              value={cfg.orbit.altitudeScale}
              min={ANIMATION_LIMITS.orbit.altitudeScale[0]}
              max={ANIMATION_LIMITS.orbit.altitudeScale[1]}
              step={0.05}
              unit="×"
              onChange={(v) => set('orbit', 'altitudeScale', v)}
            />
            <Slider
              label={t('anim.orbit.duration')}
              value={speedSeconds}
              min={4}
              max={30}
              step={1}
              unit=" s"
              onChange={(v) => set('orbit', 'durationMs', v * 1000)}
            />
            <Field label={t('anim.orbit.speed')}>
              <select
                className="field"
                value={speed}
                onChange={(e) => e.target.value !== 'custom' && set('orbit', 'durationMs', Number(e.target.value) * 1000)}
              >
                <option value="custom">{t('anim.orbit.speedCustom')}</option>
                <option value="20">{t('anim.orbit.speedSlow')}</option>
                <option value="12">{t('anim.orbit.speedNormal')}</option>
                <option value="7">{t('anim.orbit.speedFast')}</option>
              </select>
            </Field>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
              {t('anim.orbit.note')}
            </p>
          </section>
        )}

        <section className="space-y-3">
          <h4 className="label !mb-0">{t('anim.focus.section')}</h4>
          {withOrbit && (
            <Field label={t('anim.focus.facade')}>
              <select
                className="field"
                value={facade}
                onChange={(e) => e.target.value !== 'custom' && set('focus', 'bearingOffset', Number(e.target.value))}
              >
                <option value="180">{t('anim.focus.front')}</option>
                <option value="0">{t('anim.focus.back')}</option>
                <option value="90">{t('anim.focus.sidePlus')}</option>
                <option value="-90">{t('anim.focus.sideMinus')}</option>
                <option value="custom">{t('anim.focus.custom')}</option>
              </select>
            </Field>
          )}
          <Slider
            label={t('anim.focus.bearing')}
            value={cfg.focus.bearingOffset}
            min={ANIMATION_LIMITS.focus.bearingOffset[0]}
            max={ANIMATION_LIMITS.focus.bearingOffset[1]}
            step={1}
            unit="°"
            onChange={(v) => set('focus', 'bearingOffset', v)}
          />
          <Slider
            label={t('anim.focus.pitch')}
            value={cfg.focus.pitch}
            min={ANIMATION_LIMITS.focus.pitch[0]}
            max={ANIMATION_LIMITS.focus.pitch[1]}
            step={1}
            unit="°"
            onChange={(v) => set('focus', 'pitch', v)}
          />
          <Slider
            label={t('anim.focus.distance')}
            value={cfg.focus.distanceScale}
            min={ANIMATION_LIMITS.focus.distanceScale[0]}
            max={ANIMATION_LIMITS.focus.distanceScale[1]}
            step={0.05}
            unit="×"
            onChange={(v) => set('focus', 'distanceScale', v)}
          />
          <Slider
            label={t('anim.focus.duration')}
            value={cfg.focus.durationMs / 1000}
            min={0.3}
            max={4}
            step={0.1}
            unit=" s"
            onChange={(v) => set('focus', 'durationMs', v * 1000)}
          />
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
            {t(isPlace ? 'anim.points.note' : 'anim.focus.note')}
          </p>
        </section>
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3">
      <button className="absolute inset-0 cursor-default" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={p.onClose} aria-label={t('common.close')} />
      <div
        className="glass rise relative flex max-h-[86dvh] w-full max-w-[440px] flex-col rounded-[24px]"
        style={{ background: 'var(--panel-solid)' }}
        role="dialog"
        aria-modal="true"
        aria-label={t('anim.title')}
      >
        <header className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <Icon name="sliders" size={20} />
          <h2 className="mr-auto text-[15px] font-bold">{t('anim.title')}</h2>
          <button className="fab !h-11 !w-11" onClick={p.onClose} aria-label={t('common.close')}>
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="scroll-y min-h-0 flex-1 space-y-5 px-4 py-4">
          <section className="space-y-3">
            <h3 className="label !mb-0">{t('anim.general')}</h3>
            <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>
              {t('anim.hint')}
            </p>
            {controls(general, setGeneral, true)}
          </section>

          <div className="h-px" style={{ background: 'var(--border)' }} />

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="label !mb-0">{t('anim.individual')}</h3>
              {customized && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ background: 'color-mix(in srgb, var(--accent) 22%, transparent)' }}
                >
                  {t('anim.customized')}
                </span>
              )}
            </div>
            {selected ? (
              <>
                <p className="text-[12.5px] font-semibold">{t('anim.selected')}: {name}</p>
                {controls(effective, setOverride, !isPlace)}
                {customized && (
                  <button className="btn btn-sm w-full" onClick={() => commit(undefined, 'reset')}>
                    <Icon name="undo" size={16} /> {t('anim.reset')}
                  </button>
                )}
              </>
            ) : (
              <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                {t('anim.noSelection')}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
