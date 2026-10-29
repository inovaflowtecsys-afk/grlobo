import { type ReactNode, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

type ModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
  hideHeader?: boolean;
};

// Sem onClose o modal é bloqueante (ex.: troca obrigatória de senha).
export function Modal({ open, title, children, onClose, className, hideHeader }: ModalProps) {
  useEffect(() => {
    if (!open || !onClose) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title || undefined}>
      <div className={cn("w-full max-w-2xl rounded-lg bg-white shadow-[0_30px_100px_rgba(0,0,0,0.35)]", className)}>
        {!hideHeader ? (
          <div className="flex items-center justify-between border-b border-brand-border/15 px-5 py-4">
            <h2 className="text-base font-bold">{title}</h2>
            {onClose ? (
              <button type="button" className="rounded-md p-2 text-brand-border transition hover:bg-brand-muted" onClick={onClose} aria-label="Fechar">
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="max-h-[78vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
