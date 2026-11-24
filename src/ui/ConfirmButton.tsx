import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useI18n } from '../i18n';
import { Icon, type IconName } from './Icon';

/**
 * Confirmación en la propia interfaz: nunca bloquea el hilo con `window.confirm`, se
 * puede cancelar sin mutar el documento y se cierra con Escape o al tocar fuera.
 */
export function ConfirmButton({
  label,
  message,
  onConfirm,
  icon = 'trash',
  className = '',
  triggerClassName = 'fab !h-11 !w-11',
  triggerStyle,
  showLabel = false,
}: {
  label: string;
  message: string;
  onConfirm(): void;
  icon?: IconName;
  className?: string;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
  showLabel?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', outside);
    window.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  if (open) {
    return (
      <div ref={ref} role="alertdialog" aria-label={label} className={`flex min-w-0 items-center gap-1 ${className}`}>
        <p className="min-w-0 flex-1 text-[11.5px] leading-tight" style={{ color: 'var(--muted)' }}>
          {message}
        </p>
        <button
          type="button"
          className="btn btn-sm !min-h-11 !px-2.5"
          onClick={() => setOpen(false)}
          aria-label={t('common.cancel')}
          title={t('common.cancel')}
        >
          <Icon name="close" size={15} />
        </button>
        <button
          type="button"
          className="btn btn-sm btn-danger !min-h-11 !px-2.5"
          onClick={() => {
            setOpen(false);
            onConfirm();
          }}
          aria-label={t('common.confirm')}
          title={t('common.confirm')}
        >
          <Icon name="check" size={15} />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className={`inline-flex ${className}`}>
      <button
        type="button"
        className={triggerClassName}
        style={triggerStyle}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={label}
        aria-expanded={false}
        title={label}
      >
        <Icon name={icon} size={17} />
        {showLabel && <span>{label}</span>}
      </button>
    </div>
  );
}
