import { useEffect, useState } from "react";
import { Check, Copy, Receipt, X } from "lucide-react";
import { Modal } from "../ui/modal";
import { numeroNota } from "../../lib/conhecimentoFormat";
import { getNotasFiscais } from "../../services/conhecimentos";
import type { ConhecimentoListItem, NotaFiscal } from "../../types/conhecimento";

export function NotasFiscaisModal({ conhecimento: c, onClose }: { conhecimento: ConhecimentoListItem; onClose: () => void }) {
  const [notas, setNotas] = useState<NotaFiscal[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    getNotasFiscais(c.dominio, c.chave_linha, c.numero_nf)
      .then((r) => ativo && setNotas(r))
      .catch((e) => ativo && setErro(e instanceof Error ? e.message : "Não foi possível carregar as notas fiscais."))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [c.dominio, c.chave_linha, c.numero_nf]);

  async function copiar(id: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      window.setTimeout(() => setCopiado((atual) => (atual === id ? null : atual)), 1500);
    } catch {
      // sem permissão da área de transferência: o texto continua selecionável na tela
    }
  }

  const numeros = notas.map((n) => numeroNota(n.numero));

  return (
    <Modal open title={`Notas fiscais do CTRC ${c.ctrc ?? ""}`} onClose={onClose} hideHeader className="max-w-xl">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
              <Receipt className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-bold">Notas fiscais</h3>
              <p className="text-sm text-brand-border">
                CTRC {c.ctrc ?? "-"}
                {!carregando && !erro ? ` · ${notas.length} ${notas.length === 1 ? "nota" : "notas"}` : ""}
              </p>
            </div>
          </div>
          <button type="button" className="rounded-md p-2 text-brand-border transition hover:bg-brand-muted" onClick={onClose} aria-label="Fechar">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {carregando ? <p className="py-8 text-center text-sm text-brand-border">Carregando notas fiscais...</p> : null}
        {erro ? <div role="alert" className="rounded-md border border-status-error/25 bg-status-error/10 px-3 py-2 text-sm text-status-error">{erro}</div> : null}
        {!carregando && !erro && !notas.length ? <p className="py-8 text-center text-sm text-brand-border">Nenhuma nota fiscal informada neste conhecimento.</p> : null}

        {notas.length ? (
          <>
            <ul className="max-h-[50vh] divide-y divide-brand-border/10 overflow-y-auto rounded-xl border border-brand-border/15">
              {notas.map((n, i) => {
                const numero = numeroNota(n.numero);
                const id = `${numero}-${i}`;
                return (
                  <li key={id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2">
                        <span className="text-base font-bold tabular-nums">{numero}</span>
                        {n.serie ? <span className="rounded bg-brand-muted px-1.5 py-0.5 text-[11px] font-semibold text-brand-border">Série {n.serie}</span> : null}
                      </p>
                      {n.chave ? <p className="mt-0.5 break-all font-mono text-[11px] text-brand-border">{n.chave}</p> : null}
                    </div>
                    <button
                      type="button"
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-brand-border transition hover:bg-brand-muted hover:text-brand-dark"
                      onClick={() => copiar(id, numero)}
                      title="Copiar número"
                      aria-label={`Copiar número da nota ${numero}`}
                    >
                      {copiado === id ? <Check className="size-4 text-status-success" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            {notas.length > 1 ? (
              <button
                type="button"
                className="inline-flex items-center gap-2 text-sm font-semibold text-brand-primary hover:underline"
                onClick={() => copiar("todas", numeros.join(", "))}
              >
                {copiado === "todas" ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                {copiado === "todas" ? "Números copiados" : "Copiar todos os números"}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
