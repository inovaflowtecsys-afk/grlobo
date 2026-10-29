import { type ReactNode, useMemo, useState } from "react";
import { Eye, Search, X } from "lucide-react";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { formatDateBR } from "../../lib/format";
import { placaComHifen, titulo as tituloPessoa } from "../../lib/entregasCalculos";
import type { Atrasado, Pendencia } from "../../types/entrega";

export type ColunaLista<T> = { cabecalho: string; className?: string; render: (linha: T) => ReactNode };

type ListaDialogProps<T> = {
  titulo: string;
  descricao?: string;
  colunas: ColunaLista<T>[];
  linhas: T[];
  chave: (linha: T) => string;
  /** Texto usado pela busca; sem ele a caixa de busca não aparece. */
  textoBusca?: (linha: T) => string;
  /** Quando informado, a linha abre os detalhes do conhecimento. */
  aoAbrir?: (linha: T) => void;
  vazio?: string;
  aviso?: string;
  /** Conteúdo extra logo abaixo do título (resumos, filtros). */
  cabecalhoExtra?: ReactNode;
  onClose: () => void;
};

/** Janela com a lista completa ("Ver todos"), no mesmo padrão visual das listas de Conhecimentos. */
export function ListaDialog<T>({ titulo, descricao, colunas, linhas, chave, textoBusca, aoAbrir, vazio = "Nada a mostrar.", aviso, cabecalhoExtra, onClose }: ListaDialogProps<T>) {
  const [busca, setBusca] = useState("");
  const colunasExibidas = useMemo(() => {
    if (titulo.toLowerCase().includes("atras")) {
      return colunas.map((coluna, indice) => (indice === 5 ? { ...coluna, render: (linha: T) => renderLocalizacaoAtrasado(linha) } : coluna));
    }
    if (titulo !== "Pendências abertas") return colunas;
    return colunas.map((coluna, indice) =>
      indice === 0
        ? {
            ...coluna,
            render: (linha: T) => {
              const l = linha as unknown as Pendencia;
              const motivo = [l.ocorrencia_codigo, tituloPessoa(l.motivo_insucesso)].filter(Boolean).join(" - ") || "-";
              return (
                <div>
                  <span className="font-semibold">{l.ctrc}</span>
                  <Badge variant={varianteOcorrencia(l.ocorrencia_codigo)} className="mt-0.5 block max-w-52 truncate px-1.5 py-0.5 text-left text-[11px]" title={motivo}>
                    {motivo}
                  </Badge>
                </div>
              );
            },
          }
        : indice === 5
        ? {
            ...coluna,
            render: (linha: T) => {
              const l = linha as unknown as Atrasado;
              return l.ultima_ocorrencia ? (
                <div className="max-w-56 space-y-0.5">
                  <p className="truncate text-brand-border" title={l.localizacao_atual ?? undefined}>{l.localizacao_atual || "-"}</p>
                  <Badge variant={varianteOcorrencia(l.ultima_ocorrencia)} className="mt-0.5 block max-w-56 truncate px-1.5 py-0.5 text-left text-[11px]" title={[l.ultima_ocorrencia, l.ocorrencia_descricao].filter(Boolean).join(" - ")}>
                    {[l.ultima_ocorrencia, l.ocorrencia_descricao].filter(Boolean).join(" - ")}
                    {l.placa ? ` · ${placaComHifen(l.placa)}` : ""}
                  </Badge>
                </div>
              ) : null;
            },
          }
        : indice === 3
        ? {
            ...coluna,
            cabecalho: "Veículo",
            render: (linha: T) => {
              const l = linha as unknown as Pendencia;
              return (
                <div className="font-mono text-xs font-bold tracking-wider">
                  <span>{placaComHifen(l.placa) || "-"}</span>
                  <span className="block font-sans text-xs font-normal tracking-normal text-brand-border">{tituloPessoa(l.motorista)}</span>
                  <span className="block font-sans text-xs font-normal tracking-normal text-brand-border">
                    Romaneio {l.romaneio || "-"} · {formatDateBR(l.data_ocorrencia)}
                  </span>
                </div>
              );
            },
          }
        : coluna,
    );
  }, [colunas, titulo]);
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return termo && textoBusca ? linhas.filter((l) => textoBusca(l).toLowerCase().includes(termo)) : linhas;
  }, [busca, linhas, textoBusca]);

  return (
    <Dialog open label={titulo} onClose={onClose} className="max-w-5xl">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-brand-border/15 bg-white px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{titulo}</h2>
          <p className="mt-0.5 text-sm text-brand-border">
            {filtradas.length === linhas.length ? `${linhas.length} registro${linhas.length === 1 ? "" : "s"}` : `${filtradas.length} de ${linhas.length} registros`}
            {descricao ? ` · ${descricao}` : ""}
          </p>
        </div>
        <button type="button" onClick={onClose} className="-mr-1 rounded-md p-2 text-brand-border transition hover:bg-brand-muted" aria-label="Fechar">
          <X className="size-5" aria-hidden="true" />
        </button>
      </header>

      {cabecalhoExtra ? <div className="shrink-0 border-b border-brand-border/15 bg-white px-5 py-3 sm:px-6">{cabecalhoExtra}</div> : null}

      {textoBusca ? (
        <div className="shrink-0 border-b border-brand-border/15 bg-white px-5 py-3 sm:px-6">
          <div className="relative sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-border" aria-hidden="true" />
            <Input className="h-10 pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nesta lista" aria-label="Buscar nesta lista" />
          </div>
        </div>
      ) : null}

      {aviso ? <p role="status" className="shrink-0 border-b border-status-warning/30 bg-status-warning/10 px-6 py-2 text-sm font-medium text-amber-800">{aviso}</p> : null}

      <div className="min-h-0 flex-1 overflow-auto bg-white">
        {filtradas.length ? (
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-brand-muted text-xs uppercase text-brand-border">
              <tr>
              {colunasExibidas.map((c) => (
                  <th key={c.cabecalho} className={`whitespace-nowrap px-4 py-3 font-bold first:pl-6 ${c.className ?? ""}`}>{c.cabecalho}</th>
                ))}
                {aoAbrir ? <th className="w-12 px-4 py-3 pr-6" aria-label="Detalhes" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/10">
              {filtradas.map((linha) => (
                <tr key={chave(linha)} className={aoAbrir ? "cursor-pointer transition hover:bg-brand-surface" : "transition hover:bg-brand-surface"} onClick={aoAbrir ? () => aoAbrir(linha) : undefined}>
                  {colunasExibidas.map((c) => (
                    <td key={c.cabecalho} className={`px-4 py-3 align-middle first:pl-6 ${c.className ?? ""}`}>{c.render(linha)}</td>
                  ))}
                  {aoAbrir ? (
                    <td className="px-4 py-3 pr-6 text-right">
                      <button
                        type="button"
                        className="inline-flex size-8 items-center justify-center rounded-md text-brand-border transition hover:bg-brand-muted hover:text-brand-dark"
                        aria-label="Ver detalhes do conhecimento"
                        title="Ver detalhes do conhecimento"
                        onClick={(e) => {
                          e.stopPropagation();
                          aoAbrir(linha);
                        }}
                      >
                        <Eye className="size-4" aria-hidden="true" />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-6 py-16 text-center text-sm text-brand-border">{linhas.length ? "Nenhum resultado para a busca." : vazio}</p>
        )}
      </div>
    </Dialog>
  );
}

function varianteOcorrencia(codigo: string | null) {
  switch (codigo?.trim()) {
    case "5":
      return "info" as const;
    case "11":
      return "accent" as const;
    case "13":
      return "danger" as const;
    case "38":
      return "warning" as const;
    case "52":
      return "neutral" as const;
    default:
      return "warning" as const;
  }
}

function renderLocalizacaoAtrasado<T>(linha: T) {
  const l = linha as unknown as Atrasado;
  return l.ultima_ocorrencia ? (
    <div className="max-w-56 space-y-0.5">
      <p className="truncate text-brand-border" title={l.localizacao_atual ?? undefined}>{l.localizacao_atual || "-"}</p>
      <Badge variant={varianteOcorrencia(l.ultima_ocorrencia)} className="mt-0.5 block max-w-56 truncate px-1.5 py-0.5 text-left text-[11px]" title={[l.ultima_ocorrencia, l.ocorrencia_descricao].filter(Boolean).join(" - ")}>
        {[l.ultima_ocorrencia, l.ocorrencia_descricao].filter(Boolean).join(" - ")}
        {l.placa ? ` · ${placaComHifen(l.placa)}` : ""}
      </Badge>
    </div>
  ) : null;
}
