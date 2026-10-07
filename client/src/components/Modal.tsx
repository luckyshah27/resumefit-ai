import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export const Modal = ({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  return (
    <dialog ref={dialog} onClose={onClose} onCancel={onClose} className="w-[calc(100%-2rem)] max-w-lg rounded-lg border border-line bg-white p-0 text-ink shadow-pop backdrop:bg-ink/20 backdrop:backdrop-blur-[2px]">
      {open && (
        <>
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="focus-ring rounded p-1 text-ink-3 hover:text-ink" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          <div className="p-5">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </>
      )}
    </dialog>
  );
};
