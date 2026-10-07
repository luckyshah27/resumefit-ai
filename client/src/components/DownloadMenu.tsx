import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import { Button, cx } from './ui';

export type DownloadItem = { label: string; description?: string; run: () => Promise<void> };

/** Small accessible menu for file downloads (keyboard: Enter/Space opens, Escape closes). */
export const DownloadMenu = ({ items, label = 'Download', onError }: { items: DownloadItem[]; label?: string; onError?: (message: string) => void }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const run = async (item: DownloadItem) => {
    setBusy(item.label);
    try {
      await item.run();
      setOpen(false);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Download failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={root} className="relative">
      <Button icon={<Download className="size-4" />} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)} loading={busy !== null}>
        {label}
        <ChevronDown className="size-3.5 text-ink-3" aria-hidden />
      </Button>
      {open && (
        <div id={id} role="menu" className="absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-md border border-line bg-white py-1 shadow-pop">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={busy !== null}
              onClick={() => run(item)}
              className={cx('focus-ring block w-full px-3 py-2 text-left text-sm hover:bg-canvas disabled:opacity-60')}
            >
              <span className="block font-medium text-ink">{item.label}</span>
              {item.description && <span className="block text-xs text-ink-3">{item.description}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
