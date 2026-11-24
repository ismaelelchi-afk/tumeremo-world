/**
 * Ficha comercial de TUMEREMO WORLD inspirada en `BusinessPanel` de tumeremo-3d.
 *
 * Comportamiento reproducido:
 *  - Escritorio: panel lateral fijo con cuerpo desplazable y pie de acciones.
 *  - Móvil: hoja inferior compacta (46dvh) que se expande a 88dvh mediante un
 *    tirador superior; un gesto corto alterna el estado, arriba expande y abajo
 *    contrae (o cierra si ya estaba compacta).
 *  - Galería con scroll-snap, puntos y flechas, igual que `PhotoCarousel`.
 *
 * Consume la ficha compuesta del `Business` del documento compartido y el perfil
 * original; no toca el mapa, la cámara, STUDIO ni la persistencia compartida.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useI18n } from '../../i18n';
import { Icon, type IconName } from '../../ui/Icon';
import type { ComposedWorldBusinessProfile, WorldCatalogEntry } from './worldBusinessProfiles';

export interface WorldBusinessPanelProps {
  profile: ComposedWorldBusinessProfile;
  isDesktop: boolean;
  expanded: boolean;
  onExpand(value: boolean): void;
  onClose(): void;
  onOrbit(): void;
  orbiting: boolean;
  canOrbit: boolean;
  onExplore(): void;
  onDemoAction(label: string): void;
}

function telLink(value: string): string {
  const clean = value.replace(/[^\d+]/g, '');
  return clean ? `tel:${clean}` : '';
}

function whatsappLink(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : '';
}

function instagramLink(value: string): string {
  const handle = value.replace(/^@+/, '').trim();
  return handle ? `https://instagram.com/${handle}` : '';
}

function mailLink(value: string): string {
  return value ? `mailto:${value}` : '';
}

export function WorldBusinessPanel(p: WorldBusinessPanelProps) {
  const { t } = useI18n();
  if (p.isDesktop) {
    return (
      <aside
        className="rise pointer-events-auto flex h-full w-[400px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5"
        aria-label={t('shop.cardAria', { name: p.profile.name })}
      >
        <div className="scroll-y flex-1">
          <PanelBody {...p} compact={false} />
        </div>
        <PanelFooter {...p} />
      </aside>
    );
  }
  return <MobileSheet {...p} />;
}

function MobileSheet(p: WorldBusinessPanelProps) {
  const { t } = useI18n();
  const start = useRef<{ y: number; t: number } | null>(null);

  const onStart = (e: ReactPointerEvent) => {
    start.current = { y: e.clientY, t: Date.now() };
  };
  const onEnd = (e: ReactPointerEvent) => {
    if (!start.current) return;
    const dy = e.clientY - start.current.y;
    start.current = null;
    if (Math.abs(dy) < 8) {
      p.onExpand(!p.expanded);
      return;
    }
    if (dy < -30) p.onExpand(true);
    else if (dy > 30) {
      if (p.expanded) p.onExpand(false);
      else p.onClose();
    }
  };
  const onCancel = () => {
    start.current = null;
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    p.onExpand(!p.expanded);
  };

  return (
    <section
      className={`rise pointer-events-auto fixed inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_-12px_40px_rgba(2,6,23,0.22)] transition-[height] duration-300 ease-out ${
        p.expanded ? 'h-[88dvh]' : 'h-[min(46dvh,400px)]'
      }`}
      aria-label={t('shop.cardAria', { name: p.profile.name })}
    >
      <div
        className="flex min-h-11 shrink-0 touch-none select-none flex-col items-center justify-center pb-1 pt-2"
        role="button"
        tabIndex={0}
        aria-expanded={p.expanded}
        aria-label={p.expanded ? t('shop.collapseCard') : t('shop.expandCard')}
        onPointerDown={onStart}
        onPointerUp={onEnd}
        onPointerCancel={onCancel}
        onKeyDown={onKeyDown}
      >
        <span className="h-1.5 w-11 rounded-full bg-slate-300" />
        {!p.expanded && (
          <span className="mt-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <Icon name="chevronUp" size={12} /> {t('shop.dragHint')}
          </span>
        )}
      </div>
      <div className="scroll-y flex-1">
        <PanelBody {...p} compact />
      </div>
      <PanelFooter {...p} />
    </section>
  );
}

function PanelBody(p: WorldBusinessPanelProps & { compact: boolean }) {
  const { profile, onClose, onDemoAction, compact } = p;
  const { lang, t, formatNumber } = useI18n();
  const categoryLabel = profile.categoryLabels[lang];
  const filledStars = Math.round(profile.rating);

  const actions: Array<{ icon: IconName; label: string; href: string; tone?: 'green' }> = [
    { icon: 'phone', label: t('shop.call'), href: telLink(profile.contact.phone) },
    { icon: 'phone', label: t('shop.whatsapp'), href: whatsappLink(profile.contact.whatsapp), tone: 'green' },
    { icon: 'external', label: t('shop.instagram'), href: instagramLink(profile.contact.instagram) },
    { icon: 'external', label: t('shop.email'), href: mailLink(profile.contact.email) },
  ];

  return (
    <div>
      <BusinessCarousel profile={profile} compact={compact} onClose={onClose} />

      <div className="space-y-4 px-5 pb-5 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white"
            style={{ backgroundColor: profile.accent }}
            title={`${categoryLabel} · ${profile.originalCategory}`}
          >
            <span>{profile.emoji}</span> {categoryLabel}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-800">
            {t('shop.officialBadge')}
          </span>
        </div>

        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-slate-900">{profile.name}</h2>
            {profile.slogan && <p className="mt-1 text-[15px] font-medium text-slate-500">{profile.slogan}</p>}
            {profile.rating > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={`${t('shop.rating')}: ${profile.rating.toFixed(1)}`}>
                <span className="flex" aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className={i < filledStars ? 'text-[#e0a106]' : 'text-slate-300'}>★</span>
                  ))}
                </span>
                <span className="text-sm font-bold text-slate-700">
                  {formatNumber(profile.rating, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
                <span className="text-xs text-slate-400">{t('shop.ratingNote')}</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {actions.map((action) => (
            <Action
              key={action.label}
              icon={action.icon}
              label={action.label}
              href={action.href}
              tone={action.tone}
              onClick={() => onDemoAction(action.label)}
            />
          ))}
        </div>

        <p className={`text-[15px] leading-relaxed text-slate-700 ${compact ? 'line-clamp-2' : ''}`}>{profile.description}</p>

        {!compact && profile.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {profile.tags.map((tag) => (
              <span key={tag} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {tag}
              </span>
            ))}
          </div>
        )}

        {!compact && <Showcase profile={profile} />}

        {!compact && (
          <dl className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-100">
            <InfoRow icon="pin" label={t('shop.address')} value={profile.address} />
            <InfoRow icon="clock" label={t('shop.hours')} value={profile.hours} />
            <InfoRow icon="phone" label={t('shop.phone')} value={profile.contact.phone} href={telLink(profile.contact.phone)} />
            <InfoRow icon="phone" label={t('shop.whatsapp')} value={profile.contact.whatsapp} href={whatsappLink(profile.contact.whatsapp)} />
            <InfoRow icon="external" label={t('shop.instagram')} value={profile.contact.instagram} href={instagramLink(profile.contact.instagram)} />
            <InfoRow icon="external" label={t('shop.email')} value={profile.contact.email} href={mailLink(profile.contact.email)} />
          </dl>
        )}

        <div className="flex gap-2.5 rounded-2xl bg-amber-50 p-3.5 text-[13px] leading-snug text-amber-900 ring-1 ring-amber-200/70">
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          <p>{t('shop.demoNotice')}</p>
        </div>
      </div>
    </div>
  );
}

function BusinessCarousel({
  profile,
  compact,
  onClose,
}: {
  profile: ComposedWorldBusinessProfile;
  compact: boolean;
  onClose(): void;
}) {
  const { t } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    scroller.current?.scrollTo({ left: 0 });
    setIndex(0);
    setFailed({});
    setLoaded({});
  }, [profile.photos]);

  const go = (i: number) => {
    const el = scroller.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(profile.photos.length - 1, i));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' });
  };

  const fallback = (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-2 text-white"
      style={{ background: `linear-gradient(135deg, ${profile.accent}, #0b3b2e)` }}
    >
      <span className="text-4xl">{profile.emoji}</span>
      <span className="flex items-center gap-1 text-xs font-medium opacity-80">
        <Icon name="info" size={12} /> {t('shop.photoUnavailable')}
      </span>
    </div>
  );

  return (
    <div className={`group relative overflow-hidden ${compact ? 'mx-3 h-40 rounded-2xl' : 'h-56'}`}>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
        className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {profile.photos.map((src, i) => (
          <div key={`${src}-${i}`} className="relative h-full w-full shrink-0 snap-center">
            {!loaded[i] && !failed[i] && <div className="absolute inset-0 animate-pulse bg-white/10" />}
            {failed[i] ? (
              fallback
            ) : (
              <img
                src={src}
                alt={`${profile.name} — ${t('shop.photoAria', { n: i + 1, total: profile.photos.length })}`}
                loading={i === 0 ? 'eager' : 'lazy'}
                draggable={false}
                onLoad={() => setLoaded((v) => ({ ...v, [i]: true }))}
                onError={() => setFailed((v) => ({ ...v, [i]: true }))}
                className={`h-full w-full object-cover transition-opacity duration-500 ${loaded[i] ? 'opacity-100' : 'opacity-0'}`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">
        {t('shop.photoBadge')}
      </span>
      <div className="absolute right-3 top-3">
        <button
          onClick={onClose}
          aria-label={t('common.close')}
          className="grid h-11 w-11 place-items-center rounded-full bg-white/90 text-slate-700 shadow-md backdrop-blur transition hover:bg-white active:scale-90"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-1">
        {profile.photos.map((_, i) => (
          <button
            key={i}
            onClick={() => go(i)}
            aria-label={t('shop.photoAria', { n: i + 1, total: profile.photos.length })}
            aria-current={i === index}
            className="grid h-11 w-5 place-items-center"
          >
            <span className={`block h-1.5 rounded-full bg-white transition-all ${i === index ? 'w-5 opacity-100' : 'w-1.5 opacity-60'}`} />
          </button>
        ))}
      </div>
      {profile.photos.length > 1 && (
        <>
          <button
            onClick={() => go(index - 1)}
            disabled={index === 0}
            aria-label={t('shop.prevPhoto')}
            className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-slate-700 shadow transition-opacity disabled:opacity-0 group-hover:grid"
          >
            <Icon name="chevronUp" size={16} className="-rotate-90" />
          </button>
          <button
            onClick={() => go(index + 1)}
            disabled={index === profile.photos.length - 1}
            aria-label={t('shop.nextPhoto')}
            className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-slate-700 shadow transition-opacity disabled:opacity-0 group-hover:grid"
          >
            <Icon name="chevronUp" size={16} className="rotate-90" />
          </button>
        </>
      )}
    </div>
  );
}

function Showcase({ profile }: { profile: ComposedWorldBusinessProfile }) {
  const { t } = useI18n();
  const hasPromotions = profile.promotions.length > 0;
  const hasProducts = profile.products.length > 0;

  return (
    <section className="space-y-2">
      <SectionTitle>{t('shop.showcase')}</SectionTitle>
      {hasPromotions && <Promotions entries={profile.promotions} />}
      {hasProducts && <Products entries={profile.products} accent={profile.accent} />}
      {!hasPromotions && !hasProducts && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-center">
          <Icon name="store" size={22} className="mx-auto text-slate-300" />
          <p className="mt-2 text-[12px] leading-snug text-slate-500">{t('shop.emptyCatalogNote')}</p>
        </div>
      )}
    </section>
  );
}

function Promotions({ entries }: { entries: WorldCatalogEntry[] }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200/70">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
        <Icon name="info" size={14} /> {t('shop.promotions')}
      </p>
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-xl bg-white/70 px-3 py-2 ring-1 ring-amber-200/50">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-bold text-slate-800">{entry.name}</p>
            {entry.price && <span className="shrink-0 text-sm font-extrabold text-slate-700">{entry.price}</span>}
          </div>
          {entry.description && <p className="mt-0.5 text-xs leading-snug text-slate-600">{entry.description}</p>}
          {entry.badge && <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{entry.badge}</p>}
        </div>
      ))}
    </div>
  );
}

function Products({ entries, accent }: { entries: WorldCatalogEntry[]; accent: string }) {
  const { t } = useI18n();
  return (
    <section className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
      <header className="flex items-center gap-1.5 bg-slate-50 px-3 py-2">
        <Icon name="store" size={14} style={{ color: accent }} />
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">{t('shop.productsServices')}</p>
      </header>
      <ul className="divide-y divide-slate-100 bg-white">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
            {entry.image ? (
              <img src={entry.image} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400">
                <Icon name="store" size={16} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{entry.name}</p>
              {entry.description && <p className="truncate text-xs text-slate-500">{entry.description}</p>}
            </div>
            {entry.price && <span className="shrink-0 text-sm font-bold" style={{ color: accent }}>{entry.price}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-400">{children}</p>;
}

function InfoRow({ icon, label, value, href }: { icon: IconName; label: string; value: string; href?: string }) {
  return (
    <div className="flex items-start gap-3 px-3.5 py-2.5">
      <span className="mt-0.5 text-slate-500"><Icon name={icon} size={16} /></span>
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
        <dd className="break-words text-sm font-medium text-slate-700">
          {href ? (
            <a
              href={href}
              target={href.startsWith('http') ? '_blank' : undefined}
              rel={href.startsWith('http') ? 'noreferrer' : undefined}
              className="underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
            >
              {value}
            </a>
          ) : (
            value
          )}
        </dd>
      </div>
    </div>
  );
}

function Action({
  icon,
  label,
  href,
  onClick,
  tone,
}: {
  icon: IconName;
  label: string;
  href: string;
  onClick(): void;
  tone?: 'green';
}) {
  const classes = `flex flex-col items-center gap-1.5 rounded-2xl py-2.5 text-[11px] font-bold transition active:scale-95 ${
    tone === 'green' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
  }`;
  const content = (
    <>
      <Icon name={icon} size={18} />
      {label}
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        target={href.startsWith('http') ? '_blank' : undefined}
        rel={href.startsWith('http') ? 'noreferrer' : undefined}
        onClick={onClick}
        className={classes}
      >
        {content}
      </a>
    );
  }
  return (
    <button onClick={onClick} className={classes}>
      {content}
    </button>
  );
}

function PanelFooter({ onOrbit, orbiting, canOrbit, onExplore }: WorldBusinessPanelProps) {
  const { t } = useI18n();
  return (
    <div className="pb-safe flex shrink-0 gap-2 border-t border-slate-100 bg-white/95 p-3 backdrop-blur">
      <button
        onClick={onOrbit}
        aria-pressed={canOrbit ? orbiting : undefined}
        className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-bold transition-colors active:scale-[.98] ${
          canOrbit && orbiting ? 'bg-[#0b3b2e] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
        }`}
      >
        <Icon name={canOrbit ? 'rotate' : 'locate'} size={16} />
        {canOrbit ? (orbiting ? t('city.stopOrbit') : t('city.orbit')) : t('city.center')}
      </button>
      <button
        onClick={onExplore}
        className="flex h-12 flex-[1.6] items-center justify-center gap-2 rounded-2xl bg-[#0b3b2e] text-sm font-bold text-white shadow-lg transition-colors active:scale-[.98]"
      >
        <Icon name="home" size={16} className="text-[#fbd567]" /> {t('city.backExplore')}
      </button>
    </div>
  );
}
