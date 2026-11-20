import { useEffect, useMemo, useRef, useState } from 'react';
import { businessCategoryLabel, placeCategoryLabel } from '../../core/labels';
import { normalizeText } from '../../core/geo';
import type { WorldDocument, WorldSelection } from '../../core/types';
import { localizedText, useI18n } from '../../i18n';
import { Icon, type IconName } from '../../ui/Icon';
import { VISUAL } from '../../ui/useEngine';

type Filter = 'all' | 'places' | 'business' | 'buildings';

interface Item {
  key: string;
  title: string;
  subtitle: string;
  group: Filter;
  icon: IconName;
  color: string;
  sel: WorldSelection;
}

export function ExplorePanel({
  doc,
  onPick,
  onHome,
  onClose,
}: {
  doc: WorldDocument;
  onPick: (s: WorldSelection) => void;
  onHome: () => void;
  onClose: () => void;
}) {
  const { lang, t } = useI18n();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    for (const b of doc.businesses.filter((x) => x.published && x.buildingId)) {
      list.push({
        key: b.id,
        title: localizedText(b, 'name', lang),
        subtitle: `${businessCategoryLabel(b.category, lang)}${b.origin === 'demo' ? t('explore.bizDemo') : ''}`,
        group: 'business',
        icon: 'store',
        color: b.color,
        sel: { kind: 'business', id: b.id },
      });
    }
    for (const b of doc.buildings.filter((x) => x.visible)) {
      list.push({
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
      if (p.visible === false) continue;
      list.push({
        key: p.id,
        title: localizedText(p, 'name', lang),
        subtitle: `${placeCategoryLabel(p.category, lang)}${t('explore.placeReal')}`,
        group: 'places',
        icon: p.icon ?? 'pin',
        color: VISUAL.placeColors[p.category] ?? VISUAL.placeColors.other,
        sel: { kind: 'place', id: p.id },
      });
    }
    return list;
  }, [doc, lang, t]);

  const nq = normalizeText(q.trim());
  const results = items.filter(
    (i) => (filter === 'all' || i.group === filter) && (!nq || normalizeText(i.title + ' ' + i.subtitle).includes(nq)),
  );

  const FILTERS: Array<[Filter, string]> = [
    ['all', t('explore.all')],
    ['places', t('explore.places')],
    ['business', t('explore.business')],
    ['buildings', t('explore.buildings')],
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-end md:items-start md:justify-start md:p-4" role="dialog" aria-label={t('explore.aria')}>
      <button className="absolute inset-0 bg-black/40 md:bg-transparent" onClick={onClose} aria-label={t('explore.close')} />
      <div className="glass rise relative flex max-h-[82dvh] w-full flex-col rounded-t-[28px] md:mt-[72px] md:w-[392px] md:rounded-[24px]">
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }}>
              <Icon name="search" size={18} />
            </span>
            <input
              ref={input}
              className="field !pl-10"
              placeholder={t('explore.placeholder')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={t('explore.searchAria')}
              enterKeyHint="search"
            />
          </div>
          <button className="fab" onClick={onClose} aria-label={t('explore.closeSearch')}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-3">
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className="chip shrink-0"
              style={filter === id ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="scroll-y flex-1 px-2 pb-[calc(var(--safe-b)+12px)]">
          {!nq && filter === 'all' && (
            <button className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-white/5" onClick={onHome}>
              <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: 'var(--panel-2)' }}>
                <Icon name="home" size={18} />
              </span>
              <span className="font-semibold">{t('explore.home')}</span>
            </button>
          )}
          {results.map((i) => (
            <button
              key={i.key}
              onClick={() => onPick(i.sel)}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-white/5"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: i.color, color: '#10161a' }}>
                <Icon name={i.icon} size={18} />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{i.title}</span>
                <span className="block truncate text-[12px]" style={{ color: 'var(--muted)' }}>
                  {i.subtitle}
                </span>
              </span>
            </button>
          ))}
          {results.length === 0 && (
            <p className="px-3 py-8 text-center text-[13.5px]" style={{ color: 'var(--muted)' }}>
              {t('explore.empty', { q })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
