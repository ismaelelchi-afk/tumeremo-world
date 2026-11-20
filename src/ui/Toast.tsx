import { useCallback, useEffect, useRef, useState } from 'react';

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const show = useCallback((m: string, ms = 3200) => {
    setMsg(m);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), ms);
  }, []);
  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);
  return { msg, show };
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div
      role="status"
      className="rise glass pointer-events-none fixed left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-full px-4 py-2 text-center text-[13px] font-medium"
      style={{ top: 'calc(var(--safe-t) + 72px)' }}
    >
      {msg}
    </div>
  );
}
