import { PLACE_CATEGORIES, PLACE_ICON_BY_CATEGORY, PLACE_ICONS, placeCategoryLabel, placeIconLabel } from '../../core/labels';
import type { PlaceCategory, PlaceIcon, WorldDocument } from '../../core/types';
import { localizedText, useI18n } from '../../i18n';
import { VISUAL } from '../../ui/useEngine';
import { Icon } from '../../ui/Icon';
import type { PlacePatch } from './docOps';
import { Field, Toggle } from './fields';

interface Props {
  doc: WorldDocument;
  editingId: string | null;
  onEdit: (id: string | null) => void;
  onPatch: (id: string, patch: PlacePatch) => void;
  onShowPlace: (id: string) => void;
}

const iconOf = (category: PlaceCategory, icon?: PlaceIcon) => icon ?? PLACE_ICON_BY_CATEGORY[category];

export function PlacesTab({ doc, editingId, onEdit, onPatch, onShowPlace }: Props) {
  const { lang, t } = useI18n();
  const places = doc.places ?? [];
  const place = places.find((p) => p.id === editingId);

  if (!place) {
    return (
      <div className="space-y-3">
        <p className="pb-1 text-[12.5px]" style={{ color: 'var(--muted)' }}>
          {t('points.count', { n: places.length, v: places.filter((p) => p.visible !== false).length })}
        </p>
        {places.length === 0 && (
          <p className="py-6 text-center text-[13px]" style={{ color: 'var(--muted)' }}>
            {t('points.empty')}
          </p>
        )}
        <div className="space-y-2">
          {places.map((p) => {
            const on = p.id === editingId;
            const color = VISUAL.placeColors[p.category] ?? VISUAL.placeColors.other;
            return (
              <div
                key={p.id}
                className="flex items-center gap-1 rounded-2xl pr-1"
                style={{ background: on ? 'color-mix(in srgb, var(--accent) 22%, transparent)' : 'var(--panel-2)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}` }}
              >
                <button className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left" onClick={() => onEdit(p.id)}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: color, color: '#10161a', opacity: p.visible !== false ? 1 : 0.4 }}>
                    <Icon name={iconOf(p.category, p.icon)} size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold" style={{ opacity: p.visible !== false ? 1 : 0.5 }}>{localizedText(p, 'name', lang)}</span>
                    <span className="block truncate text-[12px]" style={{ color: 'var(--muted)' }}>
                      {placeCategoryLabel(p.category, lang)}
                    </span>
                  </span>
                </button>
                <button
                  className="fab !h-9 !w-9"
                  onClick={() => onPatch(p.id, { visible: p.visible === false })}
                  aria-label={p.visible !== false ? t('common.hide') : t('common.show')}
                  title={p.visible !== false ? t('common.hide') : t('common.show')}
                >
                  <Icon name={p.visible !== false ? 'eye' : 'eyeOff'} size={17} />
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-[11.5px]" style={{ color: 'var(--muted)' }}>
          {t('points.hint')}
        </p>
      </div>
    );
  }

  const set = (patch: PlacePatch) => onPatch(place.id, patch);
  const color = VISUAL.placeColors[place.category] ?? VISUAL.placeColors.other;
  return (
    <div className="space-y-4">
      <button className="btn btn-sm" onClick={() => onEdit(null)}>
        <Icon name="back" size={16} /> {t('points.all')}
      </button>

      <div className="flex items-center gap-3 rounded-2xl p-3" style={{ background: 'var(--panel-2)', border: '1px solid var(--border)' }}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: color, color: '#10161a' }}>
          <Icon name={iconOf(place.category, place.icon)} size={22} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-bold">{localizedText(place, 'name', lang)}</span>
          <span className="block truncate text-[12px]" style={{ color: 'var(--muted)' }}>
            {placeCategoryLabel(place.category, lang)}{t('points.realPlace')}
          </span>
        </span>
      </div>

      <Field label={t('common.name')}>
        <input className="field" value={localizedText(place, 'name', lang)} onChange={(e) => set({ name: e.target.value })} />
      </Field>

      <Field label={t('common.description')}>
        <textarea className="field" value={localizedText(place, 'description', lang)} onChange={(e) => set({ description: e.target.value })} />
      </Field>

      <Field label={t('common.category')}>
        <select
          className="field"
          value={place.category}
          onChange={(e) => set({ category: e.target.value as PlaceCategory })}
        >
          {PLACE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{placeCategoryLabel(c, lang)}</option>
          ))}
        </select>
      </Field>

      <Field label={t('points.iconField')}>
        <select className="field" value={iconOf(place.category, place.icon)} onChange={(e) => set({ icon: e.target.value as PlaceIcon })}>
          {PLACE_ICONS.map((i) => (
            <option key={i} value={i}>{placeIconLabel(i, lang)}</option>
          ))}
        </select>
      </Field>

      <section className="space-y-3">
        <h3 className="label !mb-0">{t('common.position')}</h3>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('common.latitude')}>
            <input
              className="field"
              type="number"
              step="0.00001"
              value={place.position.lat}
              onChange={(e) => Number.isFinite(e.target.valueAsNumber) && set({ position: { ...place.position, lat: e.target.valueAsNumber } })}
            />
          </Field>
          <Field label={t('common.longitude')}>
            <input
              className="field"
              type="number"
              step="0.00001"
              value={place.position.lng}
              onChange={(e) => Number.isFinite(e.target.valueAsNumber) && set({ position: { ...place.position, lng: e.target.valueAsNumber } })}
            />
          </Field>
        </div>
        <button className="btn btn-sm w-full" onClick={() => onShowPlace(place.id)}>
          <Icon name="pin" size={16} /> {t('points.center')}
        </button>
      </section>

      <Toggle label={t('points.visibleToggle')} on={place.visible !== false} onChange={(v) => set({ visible: v })} />

      <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
        {place.source.type === 'osm'
          ? t('points.sourceOsm', { layer: place.source.layer, subclass: place.source.subclass })
          : t('points.sourceManual', { note: place.source.note })}
        {' · '}{t('common.id')}: {place.id}
      </p>
    </div>
  );
}
