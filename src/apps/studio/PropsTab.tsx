import { placeCategoryLabel } from '../../core/labels';
import type { CustomBuilding, Entity3D, EntityRef, ModelParams, WorldDocument } from '../../core/types';
import { getModel, getModelLibrary } from '../../data/models';
import { localizedText, useI18n } from '../../i18n';
import { Icon } from '../../ui/Icon';
import { Field, Slider } from './fields';

interface Props {
  doc: WorldDocument;
  entity: Entity3D | undefined;
  onPatch: (patch: Record<string, unknown>, key: string) => void;
  onParams: (patch: Partial<ModelParams>, key: string) => void;
  onPlacement: (patch: { position?: { lng: number; lat: number }; heading?: number; scale?: number }, key: string) => void;
  onSwapModel: (modelId: string) => void;
  onAlign: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onLinkBusiness: (businessId: string, buildingId: string | null) => void;
  onCreateBusiness: (buildingId: string) => void;
  onOpenBusiness: (businessId: string) => void;
}

export function PropsTab(p: Props) {
  const e = p.entity;
  const { lang, t } = useI18n();
  if (!e) {
    return (
      <div className="grid place-items-center gap-3 py-10 text-center" style={{ color: 'var(--muted)' }}>
        <Icon name="pointer" size={32} />
        <p className="max-w-[240px] text-[13.5px] leading-relaxed">
          {t('props.emptyHint')}
        </p>
      </div>
    );
  }
  const model = getModel(e.modelId);
  const ref: EntityRef = { kind: e.kind, id: e.id };
  const lim = model?.limits;
  const step = (r: [number, number]) => (r[1] - r[0] > 20 ? 0.5 : 0.1);
  const building = e.kind === 'building' ? (e as CustomBuilding) : null;
  const linked = building ? p.doc.businesses.filter((b) => b.buildingId === building.id) : [];
  const unlinked = building ? p.doc.businesses.filter((b) => b.buildingId !== building.id) : [];
  const sameCategory = getModelLibrary().filter((m) => m.category === model?.category);
  const k = `${ref.id}:`;

  return (
    <div className="space-y-4">
      <Field label={t('common.name')}>
        <input className="field" value={localizedText(e, 'name', lang)} onChange={(ev) => p.onPatch({ name: ev.target.value }, k + 'name')} />
      </Field>

      <Field label={t('props.model')}>
        <select className="field" value={e.modelId} onChange={(ev) => p.onSwapModel(ev.target.value)}>
          {sameCategory.map((m) => (
            <option key={m.id} value={m.id}>
              {localizedText(m, 'name', lang)}
            </option>
          ))}
        </select>
      </Field>

      <section className="space-y-3">
        <h3 className="label !mb-0">{t('props.posOrientation')}</h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">{t('common.latitude')}</label>
            <input
              className="field"
              type="number"
              step="0.00001"
              value={e.placement.position.lat}
              onChange={(ev) => Number.isFinite(ev.target.valueAsNumber) && p.onPlacement({ position: { lng: e.placement.position.lng, lat: ev.target.valueAsNumber } }, k + 'pos')}
            />
          </div>
          <div>
            <label className="label">{t('common.longitude')}</label>
            <input
              className="field"
              type="number"
              step="0.00001"
              value={e.placement.position.lng}
              onChange={(ev) => Number.isFinite(ev.target.valueAsNumber) && p.onPlacement({ position: { lat: e.placement.position.lat, lng: ev.target.valueAsNumber } }, k + 'pos')}
            />
          </div>
        </div>
        <Slider label={t('props.rotation')} value={e.placement.heading} min={0} max={359} step={1} unit="°" onChange={(v) => p.onPlacement({ heading: v }, k + 'rot')} />
        <button className="btn btn-sm w-full" onClick={p.onAlign}>
          <Icon name="road" size={16} /> {t('props.alignFacade')}
        </button>
        <Slider label={t('props.scale')} value={e.placement.scale} min={0.3} max={4} step={0.05} unit="×" onChange={(v) => p.onPlacement({ scale: v }, k + 'scale')} />
      </section>

      {lim && (
        <section className="space-y-2">
          <h3 className="label !mb-0">{t('props.dimensions')}</h3>
          <Slider label={t('props.width')} value={e.params.width} min={lim.width[0]} max={lim.width[1]} step={step(lim.width)} unit=" m" onChange={(v) => p.onParams({ width: v }, k + 'w')} />
          <Slider label={t('props.depth')} value={e.params.depth} min={lim.depth[0]} max={lim.depth[1]} step={step(lim.depth)} unit=" m" onChange={(v) => p.onParams({ depth: v }, k + 'd')} />
          <Slider label={t('props.height')} value={e.params.height} min={lim.height[0]} max={lim.height[1]} step={step(lim.height)} unit=" m" onChange={(v) => p.onParams({ height: v }, k + 'h')} />
        </section>
      )}

      <section>
        <h3 className="label">{t('props.colors')}</h3>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['wallColor', 'props.colorMain'],
              ['roofColor', 'props.colorSecondary'],
              ['accentColor', 'props.colorAccent'],
            ] as const
          ).map(([key, labelKey]) => (
            <div key={key}>
              <input type="color" value={toHex(e.params[key])} onChange={(ev) => p.onParams({ [key]: ev.target.value }, k + key)} aria-label={t('props.colorAria', { label: t(labelKey) })} />
              <span className="mt-1 block text-center text-[11px]" style={{ color: 'var(--muted)' }}>
                {t(labelKey)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {building && (
        <>
          <Field label={t('common.description')}>
            <textarea className="field" value={localizedText(building, 'description', lang)} onChange={(ev) => p.onPatch({ description: ev.target.value }, k + 'desc')} />
          </Field>
          <Field label={t('props.realPlaceRef')}>
            <select className="field" value={building.placeId ?? ''} onChange={(ev) => p.onPatch({ placeId: ev.target.value || null }, k + 'place')}>
              <option value="">{t('common.none')}</option>
              {(p.doc.places ?? []).map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {localizedText(pl, 'name', lang)} ({placeCategoryLabel(pl.category, lang)})
                </option>
              ))}
            </select>
          </Field>

          <section className="space-y-2">
            <h3 className="label !mb-0">{t('props.businessesHere')}</h3>
            {linked.length === 0 && (
              <p className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
                {t('props.noLinked')}
              </p>
            )}
            {linked.map((b) => (
              <div key={b.id} className="flex items-center gap-2 rounded-xl p-2" style={{ background: 'var(--panel-2)', border: '1px solid var(--border)' }}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: b.color }} />
                <button className="min-w-0 flex-1 truncate text-left text-[13.5px] font-semibold" onClick={() => p.onOpenBusiness(b.id)}>
                  {localizedText(b, 'name', lang)}
                </button>
                <button className="btn btn-sm" onClick={() => p.onLinkBusiness(b.id, null)}>
                  {t('props.unlink')}
                </button>
              </div>
            ))}
            {unlinked.length > 0 && (
              <select
                className="field"
                value=""
                onChange={(ev) => ev.target.value && p.onLinkBusiness(ev.target.value, building.id)}
                aria-label={t('props.linkExistingAria')}
              >
                <option value="">{t('props.linkExisting')}</option>
                {unlinked.map((b) => (
                  <option key={b.id} value={b.id}>
                    {localizedText(b, 'name', lang)}
                    {b.buildingId ? t('props.moveFromOther') : ''}
                  </option>
                ))}
              </select>
            )}
            <button className="btn btn-sm w-full" onClick={() => p.onCreateBusiness(building.id)}>
              <Icon name="plus" size={16} /> {t('props.createHere')}
            </button>
          </section>
        </>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button className="btn" onClick={p.onDuplicate}>
          <Icon name="copy" size={17} /> {t('common.duplicate')}
        </button>
        <button className="btn btn-danger" onClick={p.onDelete}>
          <Icon name="trash" size={17} /> {t('common.delete')}
        </button>
      </div>
      <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
        {t('common.id')}: {e.id}
      </p>
    </div>
  );
}

/** <input type=color> exige #rrggbb. */
function toHex(c: string): string {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map((x) => x + x).join('');
  return '#888888';
}
