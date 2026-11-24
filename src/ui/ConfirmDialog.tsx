import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n';

/**
 * Confirmación modal controlada, para acciones sin un botón visible que la dispare
 * (atajos de teclado, restaurar original, etc.). Nunca usa `window.confirm`: el
 * documento solo se toca después de `onConfirm`, y Escape/cancelar no lo modifican.
 */
export function ConfirmDialog({
  label,
  message,
  onConfirm,
  onCancel,
}: {
  label: string;
  message: string;
  onConfirm(): void;
  onCancel(): void;
}) {
  const { t } = useI18n();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [onCancel]);

  return (
    <div
      className="fade fixed inset-0 z-[70] grid place-items-center p-4"
      style={{ background: 'rgba(4, 10, 14, 0.62)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={label}
        aria-describedby="confirm-dialog-message"
        className="rise w-full max-w-[420px] rounded-2xl p-4"
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--danger)' }}
      >
        <strong className="block text-[15px]">{label}</strong>
        <p id="confirm-dialog-message" className="pt-2 text-[13px] leading-snug" style={{ color: 'var(--muted)' }}>
          {message}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button ref={cancelRef} type="button" className="btn !min-h-11" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-danger !min-h-11"
            onClick={() => {
              onCancel();
              onConfirm();
            }}
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
