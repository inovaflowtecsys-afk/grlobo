import { numerosDasNotas } from "../../lib/conhecimentoFormat";

/** Exibe a primeira NF e a quantidade restante, no mesmo padrão da lista de Conhecimentos. */
export function NotasFiscaisInline({ numeroNf, onAbrir }: { numeroNf: string | null; onAbrir?: () => void }) {
  const numeros = numerosDasNotas(numeroNf);
  if (!numeros.length) return <span className="text-brand-border">-</span>;

  const demais = numeros.length - 1;
  const conteudo = (
    <>
      <span className="font-semibold tabular-nums">{numeros[0]}</span>
      {demais > 0 ? <span className="rounded-full bg-brand-accent/15 px-1.5 py-0.5 text-[11px] font-bold text-brand-primary">+{demais}</span> : null}
    </>
  );

  return onAbrir ? (
    <button type="button" className="group inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-1 text-left transition hover:bg-brand-muted" onClick={(event) => { event.stopPropagation(); onAbrir(); }} title="Ver notas fiscais">
      {conteudo}
    </button>
  ) : (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{conteudo}</span>
  );
}
