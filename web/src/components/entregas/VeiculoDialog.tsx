import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { ListaDialog } from "./ListaDialog";
import { Badge } from "../ui/badge";
import { limparOcorrencia } from "../../lib/conhecimentoFormat";
import { type LinhaVeiculo, placaComHifen, titulo } from "../../lib/entregasCalculos";
import { formatDateBR } from "../../lib/format";
import { listarEntregasDoVeiculo } from "../../services/entregas";
import type { EntregaVeiculo } from "../../types/entrega";

const SITUACAO: Record<EntregaVeiculo["status_entrega"], { rotulo: string; variante: "success" | "warning" | "danger" | "neutral" }> = {
  REALIZADA: { rotulo: "Entregue", variante: "success" },
  PENDENTE: { rotulo: "Pendente", variante: "warning" },
  INSUCESSO: { rotulo: "Insucesso", variante: "danger" },
  CANCELADA: { rotulo: "Cancelada", variante: "neutral" },
};

type Props = {
  veiculo: LinhaVeiculo;
  /** Abre os detalhes do conhecimento (a página abre o painel por cima desta janela). */
  aoAbrirConhecimento: (ctrc: string) => void;
  aviso?: string;
  onClose: () => void;
};

/** Conhecimentos do(s) romaneio(s) de um veículo: padrão = romaneios abertos, com opção de incluir os fechados. */
export function VeiculoDialog({ veiculo, aoAbrirConhecimento, aviso, onClose }: Props) {
  const [linhas, setLinhas] = useState<EntregaVeiculo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [incluirFechados, setIncluirFechados] = useState(false);
  const [romaneioSel, setRomaneioSel] = useState("");

  useEffect(() => {
    let ativo = true;
    listarEntregasDoVeiculo(veiculo.placa)
      .then((r) => ativo && setLinhas(r))
      .catch((e) => ativo && setErro(e instanceof Error ? e.message : "Não foi possível carregar os conhecimentos do veículo."))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [veiculo.placa]);

  const romaneiosAbertos = useMemo(() => new Set(linhas.filter((l) => l.aberta_no_ssw).map((l) => l.romaneio)), [linhas]);
  const fechadas = linhas.filter((l) => !romaneiosAbertos.has(l.romaneio)).length;
  // sem romaneio aberto (veículo disponível) mostra o histórico, senão a lista ficaria vazia
  const mostrarFechados = incluirFechados || romaneiosAbertos.size === 0;
  const visiveis = useMemo(() => linhas.filter((l) => mostrarFechados || romaneiosAbertos.has(l.romaneio)), [linhas, mostrarFechados, romaneiosAbertos]);

  // filtro por romaneio: só aparece quando há mais de um na lista
  const romaneiosDisponiveis = useMemo(() => [...new Set(visiveis.map((l) => l.romaneio).filter((r): r is string => Boolean(r)))].sort(), [visiveis]);
  const romaneioAtivo = romaneiosDisponiveis.includes(romaneioSel) ? romaneioSel : "";
  const exibidas = useMemo(() => (romaneioAtivo ? visiveis.filter((l) => l.romaneio === romaneioAtivo) : visiveis), [visiveis, romaneioAtivo]);

  const validas = exibidas.filter((l) => l.status_entrega !== "CANCELADA");
  const conta = (s: EntregaVeiculo["status_entrega"]) => validas.filter((l) => l.status_entrega === s).length;
  const listaRomaneios = [...new Set(exibidas.map((l) => l.romaneio).filter(Boolean))];
  const romaneios = listaRomaneios.join(", ");

  return (
    <ListaDialog<EntregaVeiculo>
      titulo={`${placaComHifen(veiculo.placa)} · ${titulo(veiculo.motorista) || "Sem motorista"}`}
      descricao={romaneios ? `romaneio ${romaneios}` : "conhecimentos do veículo"}
      linhas={exibidas}
      chave={(l) => `${l.romaneio}-${l.ctrc}`}
      textoBusca={(l) => `${l.ctrc} ${l.destinatario_nome ?? ""} ${l.entrega_cidade ?? ""} ${l.entrega_bairro ?? ""}`}
      aoAbrir={(l) => aoAbrirConhecimento(l.ctrc)}
      aviso={erro || aviso}
      vazio={carregando ? "Carregando conhecimentos do veículo..." : "Nenhum conhecimento em romaneio para este veículo."}
      cabecalhoExtra={
        carregando ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">Total: {validas.length}</Badge>
            <Badge variant="success">Entregues: {conta("REALIZADA")}</Badge>
            <Badge variant="warning">Pendentes: {conta("PENDENTE")}</Badge>
            {conta("INSUCESSO") > 0 ? <Badge variant="danger">Insucessos: {conta("INSUCESSO")}</Badge> : null}
            {romaneiosDisponiveis.length > 1 ? (
              <label className="ml-auto flex items-center gap-2 text-sm text-brand-border">
                Romaneio
                <select
                  className="h-9 rounded-md border border-brand-border/40 bg-white px-3 text-sm text-brand-dark outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/25"
                  value={romaneioAtivo}
                  onChange={(e) => setRomaneioSel(e.target.value)}
                  aria-label="Filtrar por romaneio"
                >
                  <option value="">Todos ({romaneiosDisponiveis.length})</option>
                  {romaneiosDisponiveis.map((r) => (
                    <option key={r} value={r}>{r} ({visiveis.filter((l) => l.romaneio === r).length})</option>
                  ))}
                </select>
              </label>
            ) : null}
            {romaneiosAbertos.size > 0 && fechadas > 0 ? (
              <label className={`flex cursor-pointer items-center gap-2 text-sm text-brand-border ${romaneiosDisponiveis.length > 1 ? "" : "ml-auto"}`}>
                <input type="checkbox" className="size-4 accent-[#12437f]" checked={incluirFechados} onChange={(e) => setIncluirFechados(e.target.checked)} />
                Incluir romaneios fechados ({fechadas})
              </label>
            ) : null}
          </div>
        )
      }
      colunas={[
        {
          cabecalho: "CTRC",
          className: "whitespace-nowrap",
          render: (l) => (
            <div className="space-y-0.5">
              <p className="font-semibold">{l.ctrc}</p>
              <p className="text-xs text-brand-border">Romaneio {l.romaneio ?? "-"}</p>
              <p className="text-xs tabular-nums text-brand-border">Emissão {formatDateBR(l.data_emissao)}</p>
            </div>
          ),
        },
        {
          cabecalho: "Destinatário",
          render: (l) => (
            <div className="max-w-52">
              <p className="truncate font-medium" title={l.destinatario_nome ?? undefined}>{titulo(l.destinatario_nome) || "-"}</p>
              <p className="truncate text-xs text-brand-border">{[titulo(l.entrega_bairro), titulo(l.entrega_cidade)].filter(Boolean).join(" · ")}</p>
            </div>
          ),
        },
        {
          cabecalho: "Previsão",
          className: "whitespace-nowrap",
          render: (l) => (
            <div className="flex flex-col items-start gap-1">
              <span className="tabular-nums">{formatDateBR(l.prev_entrega)}</span>
              {l.agendamento === "AGENDADA" ? (
                <Badge variant="accent"><CalendarClock className="mr-1 size-3" aria-hidden="true" />Agendada</Badge>
              ) : l.agendamento === "AGUARDANDO_AGENDAMENTO" ? (
                <Badge variant="info">Aguardando agendamento</Badge>
              ) : null}
            </div>
          ),
        },
        {
          cabecalho: "Situação",
          className: "whitespace-nowrap",
          render: (l) => (
            <div className="flex flex-col items-start gap-1">
              <Badge variant={SITUACAO[l.status_entrega].variante}>{SITUACAO[l.status_entrega].rotulo}</Badge>
              {l.status_entrega === "REALIZADA" && l.data_entrega ? <span className="text-xs tabular-nums text-brand-border">{formatDateBR(l.data_entrega)}</span> : null}
            </div>
          ),
        },
        {
          cabecalho: "Ocorrência",
          render: (l) => {
            if (l.status_entrega === "PENDENTE") {
              return <span className="block max-w-48 truncate text-brand-border" title="EM ENTREGA">EM ENTREGA</span>;
            }
            const texto = limparOcorrencia(l.status_entrega === "INSUCESSO" ? l.motivo_insucesso : l.ocorrencia_ctrc_descricao || l.ocorrencia_rom_descricao);
            const ocorrencia = [l.ocorrencia_ctrc_codigo || l.ocorrencia_rom_codigo, texto].filter(Boolean).join(" - ");
            return <span className="block max-w-48 truncate text-brand-border" title={ocorrencia || undefined}>{ocorrencia || "-"}</span>;
          },
        },
      ]}
      onClose={onClose}
    />
  );
}
