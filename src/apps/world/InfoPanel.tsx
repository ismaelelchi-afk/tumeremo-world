import { businessCategoryLabel, placeCategoryLabel, PLACE_ICON_BY_CATEGORY } from '../../core/labels';
import { formatCoords } from '../../core/geo';
import type { Business, Place, WorldDocument, WorldSelection } from '../../core/types';
import { getModel } from '../../data/models';
import { localizedText, useI18n } from '../../i18n';
import { Icon } from '../../ui/Icon';
import { VISUAL } from '../../ui/useEngine';
import { businessesOf, nearbyBuildings, nearestPlace } from './lookups';

interface Props {
  selection: WorldSelection;
  doc: WorldDocument;
  onSelect: (s: WorldSelection, fly?: boolean) => void;
  onClose: () => void;
  onCopy: (text: string) => void;
}

function Shell({ children, onClose, accent }: { children: React.ReactNode; onClose: () => void; accent: string }) {
  const { t } = useI18n();
  return (
    <section
      className="glass rise scroll-y fixed inset-x-0 bottom-0 z-30 max-h-[54dvh] rounded-t-[28px] pb-[calc(var(--safe-b)+16px)] md:inset-x-auto md:bottom-auto md:left-4 md:top-[84px] md:max-h-[calc(100dvh-180px)] md:w-[392px] md:rounded-[24px] md:pb-4"
      aria-live="polite"
    >
      <div className="sticky top-0 z-10 flex justify-center pt-2 md:hidden">
        <span className="h-1 w-10 rounded-full" style={{ background: 'var(--border)' }} />
      </div>
      <div className="h-[3px] w-full md:mt-0" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <button className="fab absolute right-2 top-3 z-20 !h-10 !w-10" onClick={onClose} aria-label={t('info.closePanel')}>
        <Icon name="close" size={18} />
      </button>
      <div className="px-5 pb-1 pt-4">{children}</div>
    </section>
  );
}

function Row({ icon, children }: { icon: Parameters<typeof Icon>[0]['name']; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5 text-[13.5px]">
      <span className="mt-0.5 shrink-0" style={{ color: 'var(--muted)' }}>
        <Icon name={icon} size={16} />
      </span>
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}

function BusinessCard({ b, onClick }: { b: Business; onClick: () => void }) {
  const { lang } = useI18n();
  const hours = localizedText(b, 'hours', lang);
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl p-3 text-left"
      style={{ background: 'var(--panel-2)', border: '1px solid var(--border)' }}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: b.color, color: '#10161a' }}>
        <Icon name="store" size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{localizedText(b, 'name', lang)}</span>
        <span className="block text-[12px]" style={{ color: 'var(--muted)' }}>
          {businessCategoryLabel(b.category, lang)}
          {hours ? ` · ${hours}` : ''}
        </span>
      </span>
      <Icon name="chevronUp" size={16} style={{ transform: 'rotate(90deg)', color: 'var(--muted)' }} />
    </button>
  );
}

function PlaceView({ place, doc, onSelect, onCopy }: { place: Place; doc: WorldDocument } & Pick<Props, 'onSelect' | 'onCopy'>) {
  const { lang, t, formatMeters } = useI18n();
  const color = VISUAL.placeColors[place.category];
  const near = nearbyBuildings(doc, place.position, 220).slice(0, 4);
  const osm = `https://www.openstreetmap.org/?mlat=${place.position.lat}&mlon=${place.position.lng}#map=19/${place.position.lat}/${place.position.lng}`;
  return (
    <>
      <span className="chip">
        <span style={{ color }}><Icon name={place.icon ?? PLACE_ICON_BY_CATEGORY[place.category]} size={13} /></span>
        {placeCategoryLabel(place.category, lang)} · {t('info.realPlace')}
      </span>
      <h2 className="mt-2 pr-10 text-[21px] font-bold leading-tight">{localizedText(place, 'name', lang)}</h2>
      {place.description && <p className="mt-2 text-[13.5px] leading-relaxed">{localizedText(place, 'description', lang)}</p>}
      <div className="mt-3">
        <Row icon="pin">{formatCoords(place.position, lang)}</Row>
        <Row icon="map">
          {place.source.type === 'osm'
            ? t('info.osmSource')
            : place.source.note}
        </Row>
      </div>
      {near.length > 0 && (
        <div className="mt-3">
          <span className="label">{t('info.nearby')}</span>
          <div className="flex flex-wrap gap-2">
            {near.map(({ building, meters }) => (
              <button key={building.id} className="btn btn-sm" onClick={() => onSelect({ kind: 'building', id: building.id }, true)}>
                {localizedText(building, 'name', lang)} · {formatMeters(meters)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button className="btn btn-sm flex-1" onClick={() => onCopy(formatCoords(place.position, lang))}>
          <Icon name="clipboard" size={16} /> {t('info.copyCoords')}
        </button>
        <a className="btn btn-sm flex-1" href={osm} target="_blank" rel="noopener noreferrer">
          <Icon name="external" size={16} /> {t('info.viewOsm')}
        </a>
      </div>
    </>
  );
}

function BuildingView({ id, doc, onSelect }: { id: string; doc: WorldDocument } & Pick<Props, 'onSelect'>) {
  const { lang, t, formatNumber, formatMeters } = useI18n();
  const b = doc.buildings.find((x) => x.id === id);
  if (!b) return <p>{t('info.buildingMissing')}</p>;
  const biz = businessesOf(doc, b.id);
  const model = getModel(b.modelId);
  const near = b.placeId
    ? nearestPlace((doc.places ?? []).filter((p) => p.id === b.placeId && p.visible !== false), b.placement.position)
    : null;
  return (
    <>
      <span className="chip">
        <Icon name="building" size={13} /> {model ? localizedText(model, 'name', lang) : t('default.building')} · {b.origin === 'demo' ? t('info.demo') : t('info.digitalBuilding')}
      </span>
      <h2 className="mt-2 pr-10 text-[21px] font-bold leading-tight">{localizedText(b, 'name', lang)}</h2>
      {b.description && <p className="mt-2 text-[13.5px] leading-relaxed">{localizedText(b, 'description', lang)}</p>}
      <div className="mt-3">
        <Row icon="pin">{formatCoords(b.placement.position, lang)}</Row>
        {near && <Row icon="map">{t('info.near', { name: localizedText(near.place, 'name', lang), distance: formatMeters(near.meters) })}</Row>}
        <Row icon="cube">
          {t('info.dimensions', {
            w: formatNumber(b.params.width, { maximumFractionDigits: 0 }),
            d: formatNumber(b.params.depth, { maximumFractionDigits: 0 }),
            h: formatNumber(b.params.height, { maximumFractionDigits: 0 }),
          })}
        </Row>
      </div>
      <div className="mt-3">
        <span className="label">{t('info.businessesHere')}</span>
        {biz.length === 0 ? (
          <p className="text-[13px]" style={{ color: 'var(--muted)' }}>
            {t('info.noBusinesses')}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {biz.map((x) => (
              <BusinessCard key={x.id} b={x} onClick={() => onSelect({ kind: 'business', id: x.id })} />
            ))}
          </div>
        )}
      </div>
      <p className="mt-3 text-[11.5px]" style={{ color: 'var(--muted)' }}>
        {t('info.digitalNote')}
      </p>
    </>
  );
}

function BusinessView({ id, doc, onSelect }: { id: string; doc: WorldDocument } & Pick<Props, 'onSelect'>) {
  const { lang, t } = useI18n();
  const b = doc.businesses.find((x) => x.id === id);
  if (!b) return <p>{t('info.businessMissing')}</p>;
  const building = doc.buildings.find((x) => x.id === b.buildingId);
  const wa = b.whatsapp.replace(/\D/g, '');
  const ig = b.instagram.replace(/^@/, '').trim();
  return (
    <>
      <span className="chip">
        <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
        {businessCategoryLabel(b.category, lang)} {b.origin === 'demo' ? t('info.demoProfile') : ''}
      </span>
      <h2 className="mt-2 pr-10 text-[21px] font-bold leading-tight">{localizedText(b, 'name', lang)}</h2>
      {b.description && <p className="mt-2 text-[13.5px] leading-relaxed">{localizedText(b, 'description', lang)}</p>}
      <div className="mt-3">
        {b.hours && (
          <Row icon="clock">{localizedText(b, 'hours', lang)}</Row>
        )}
        {b.phone && (
          <Row icon="phone">
            <a href={`tel:${b.phone}`} className="underline">{b.phone}</a>
          </Row>
        )}
        {wa && (
          <Row icon="phone">
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="underline">WhatsApp: {b.whatsapp}</a>
          </Row>
        )}
        {ig && (
          <Row icon="external">
            <a href={`https://instagram.com/${ig}`} target="_blank" rel="noopener noreferrer" className="underline">@{ig}</a>
          </Row>
        )}
        {!b.hours && !b.phone && !wa && !ig && (
          <p className="text-[13px]" style={{ color: 'var(--muted)' }}>{t('info.noContact')}</p>
        )}
      </div>
      {building && (
        <button className="btn mt-4 w-full" onClick={() => onSelect({ kind: 'building', id: building.id }, true)}>
          <Icon name="building" size={18} /> {t('info.viewBuilding', { name: localizedText(building, 'name', lang) })}
        </button>
      )}
    </>
  );
}

export function InfoPanel({ selection, doc, onSelect, onClose, onCopy }: Props) {
  let accent = '#e8b34b';
  let body: React.ReactNode = null;
  if (selection.kind === 'place') {
    const place = doc.places?.find((p) => p.id === selection.id && p.visible !== false);
    if (!place) return null;
    accent = VISUAL.placeColors[place.category];
    body = <PlaceView place={place} doc={doc} onSelect={onSelect} onCopy={onCopy} />;
  } else if (selection.kind === 'building') {
    body = <BuildingView id={selection.id} doc={doc} onSelect={onSelect} />;
  } else if (selection.kind === 'business') {
    accent = doc.businesses.find((b) => b.id === selection.id)?.color ?? accent;
    body = <BusinessView id={selection.id} doc={doc} onSelect={onSelect} />;
  }
  return (
    <Shell onClose={onClose} accent={accent}>
      {body}
    </Shell>
  );
}
