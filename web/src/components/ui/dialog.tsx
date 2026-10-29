import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "../../lib/utils";

type DialogProps = {
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

/**
 * Janela centralizada, com margem em volta (não encosta nas bordas da tela) e rolagem interna.
 * Fecha com Esc ou clicando fora e trava a rolagem da página.
 */
export function Dialog({ open, label, onClose, children, className }: DialogProps) {
  const janela = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const anterior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    janela.current?.focus();

    function aoTeclar(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflow;
      anterior?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-10">
      <div className="animate-fade-in absolute inset-0 bg-brand-dark/55 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={janela}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "animate-dialog-in relative flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-brand-surface text-brand-dark shadow-[0_30px_100px_rgba(10,17,25,0.45)] outline-none",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
