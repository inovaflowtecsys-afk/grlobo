import { cn } from "../../lib/utils";

type SwitchProps = {
  checked: boolean;
  onChange: (valor: boolean) => void;
  label: string;
  disabled?: boolean;
};

/** Interruptor no mesmo estilo do "Ativo" do cadastro de profissionais. */
export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "inline-flex h-6 w-10 shrink-0 items-center rounded-full border px-0.5 transition disabled:opacity-50",
        checked ? "border-brand-primary/35 bg-brand-primary/25" : "border-brand-border/20 bg-brand-muted",
      )}
      onClick={() => onChange(!checked)}
    >
      <span className={cn("size-4 rounded-full shadow-sm transition", checked ? "translate-x-4 bg-brand-primary" : "translate-x-0 bg-brand-border")} />
    </button>
  );
}
