import { useCallback, useEffect, useMemo, useState } from "react";
import { MonitorPlay, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AguardandoCard, AgendadosCard, AtrasadosCard, DpeCard, PendenciasCard, VeiculosCard } from "../components/entregas/Cartoes";
import { ListaDialog } from "../components/entregas/ListaDialog";
import { VeiculoDialog } from "../components/entregas/VeiculoDialog";
import { ConhecimentoDetalhe } from "../components/conhecimentos/ConhecimentoDetalhe";
import { NotasFiscaisInline } from "../components/conhecimentos/NotasFiscaisInline";
import { NotasFiscaisModal } from "../components/conhecimentos/NotasFiscaisModal";
import { PageHeader } from "../components/common/PageHeader";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { type FiltroRomaneios, haTempo, type LinhaVeiculo, linhasDeRomaneios, linhasDeVeiculos, placaComHifen, resumoAgendamentos, titulo } from "../lib/entregasCalculos";
import { formatDateBR, toISODate } from "../lib/format";
import { cn } from "../lib/utils";
import { getConhecimentoPorCtrc } from "../services/conhecimentos";
import { carregarPainelEntregas } from "../services/entregas";
import type { Agendamento, Atrasado, PainelEntregas, Pendencia } from "../types/entrega";
import type { ConhecimentoListItem } from "../types/conhecimento";

const ATUALIZACAO_AUTOMATICA_MS = 120_000;

type Lista = "veiculos" | "atrasados" | "aguardando" | "pendencias" | "agendados" | null;

export function EntregasPage() {
  const navigate = useNavigate();
  const [dados, setDados] = useState<PainelEntregas | null>(null);
  const [erro, setErro] = useState("");
  const [atualizando, setAtualizando] = useState(true);
  const [agora, setAgora] = useState(Date.now());
  const [lista, setLista] = useState<Lista>(null);
  const [detalhe, setDetalhe] = useState<ConhecimentoListItem | null>(null);
  const [notasDe, setNotasDe] = useState<ConhecimentoListItem | null>(null);
  const [aviso, setAviso] = useState("");
  const [veiculoAberto, setVeiculoAberto] = useState<LinhaVeiculo | null>(null);
  const [filtroRomaneios, setFiltroRomaneios] = useState<FiltroRomaneios>("ABERTOS");

  const carregar = useCallback(async () => {
    setAtualizando(true);
    try {
      setDados(await carregarPainelEntregas());
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o painel de entregas.");
    } finally {
      setAtualizando(false);
      setAgora(Date.now());
    }
  }, []);

  useEffect(() => {
    carregar();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") carregar();
    }, ATUALIZACAO_AUTOMATICA_MS);
    return () => window.clearInterval(timer);
  }, [carregar]);

  // mantém os textos "há X min" em dia sem recarregar os dados
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const hoje = toISODate(new Date());
  const veiculos = useMemo(() => (dados ? linhasDeVeiculos(dados.veiculos, dados.romaneios) : []), [dados]);
  const romaneiosAbertos = useMemo(() => (dados ? linhasDeRomaneios(dados.romaneios) : []), [dados]);
  const romaneiosLista = useMemo(() => (dados ? linhasDeRomaneios(dados.romaneios, filtroRomaneios) : []), [dados, filtroRomaneios]);
  const agendamentos = useMemo(() => (dados ? resumoAgendamentos(dados.agendamentos, hoje) : null), [dados, hoje]);

  async function abrirConhecimento(ctrc: string) {
    setAviso("");
    try {
      const c = await getConhecimentoPorCtrc(ctrc);
      if (c) setDetalhe(c);
      else setAviso(`O CTRC ${ctrc} ainda não está no relatório 455 (conhecimentos).`);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível abrir o conhecimento.");
    }
  }

  async function abrirNotasFiscais(ctrc: string) {
    setAviso("");
    try {
      const c = await getConhecimentoPorCtrc(ctrc);
      if (c) setNotasDe(c);
      else setAviso(`O CTRC ${ctrc} ainda não está no relatório 455 (conhecimentos).`);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível carregar as notas fiscais.");
    }
  }

  const fecharLista = () => {
    setLista(null);
    setAviso("");
    setFiltroRomaneios("ABERTOS");
  };

  return (
    <div className="space-y-5 p-4 md:p-7">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <PageHeader title="Entregas" description="Acompanhamento das entregas: veículos em rota, atrasos, agendamentos e pendências." />
        <div className="flex shrink-0 items-center gap-3">
          <p className="flex items-center gap-2 text-xs text-brand-border" title={dados ? "Última carga do SSW de cada relatório" : undefined}>
            <span className={cn("size-2 rounded-full", erro ? "bg-brand-red" : "bg-status-success")} aria-hidden="true" />
            {erro ? "Falha ao atualizar" : dados ? `Romaneios ${haTempo(dados.cargas.romaneios036, agora)} · Conhecimentos ${haTempo(dados.cargas.conhecimentos455, agora)}` : "Carregando"}
          </p>
          <Button variant="secondary" onClick={() => navigate("/entregas/gestao-a-vista")}>
            <MonitorPlay className="size-4" aria-hidden="true" />
            Gestão à vista
          </Button>
          <Button variant="secondary" onClick={carregar} disabled={atualizando}>
            <RefreshCw className={cn("size-4", atualizando && "animate-spin")} aria-hidden="true" />
            Atualizar
          </Button>
        </div>
      </div>

      {erro ? <div role="alert" className="rounded-lg border border-status-error/25 bg-status-error/10 px-4 py-3 text-sm font-semibold text-status-error">{erro}</div> : null}
      {!dados && !erro ? <p className="py-24 text-center text-sm text-brand-border">Carregando acompanhamento de entregas...</p> : null}

      {dados && agendamentos ? (
        <>
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-7">
              <VeiculosCard linhas={veiculos} romaneios={romaneiosAbertos} onVerTodos={() => setLista("veiculos")} onAbrirVeiculo={setVeiculoAberto} />
            </div>
            <div className="min-w-0 lg:col-span-5">
              <DpeCard dpe={dados.dpe} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 min-[1700px]:grid-cols-4">
            <AtrasadosCard atrasados={dados.atrasados} onVerTodos={() => setLista("atrasados")} />
            <AguardandoCard agendamentos={dados.agendamentos} hoje={hoje} onVerTodos={() => setLista("aguardando")} />
            <PendenciasCard pendencias={dados.pendencias} onVerTodos={() => setLista("pendencias")} />
            <AgendadosCard agendamentos={dados.agendamentos} hoje={hoje} onVerTodos={() => setLista("agendados")} />
          </div>

          {lista === "veiculos" ? (
            <ListaDialog
              titulo="Veículos / Motoristas"
              descricao={filtroRomaneios === "ABERTOS" ? "situação dos romaneios abertos" : filtroRomaneios === "BAIXADOS" ? "romaneios baixados no SSW (últimos 30 dias)" : "romaneios abertos e baixados (últimos 30 dias)"}
              linhas={romaneiosLista}
              cabecalhoExtra={
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar romaneios">
                  {([["ABERTOS", "Abertos"], ["BAIXADOS", "Baixados"], ["TODOS", "Todos"]] as const).map(([valor, rotulo]) => (
                    <Button key={valor} type="button" variant={filtroRomaneios === valor ? "primary" : "secondary"} aria-pressed={filtroRomaneios === valor} onClick={() => setFiltroRomaneios(valor)}>
                      {rotulo}
                    </Button>
                  ))}
                </div>
              }
              chave={(l) => `${l.placa}-${l.romaneio}`}
              textoBusca={(l) => `${l.placa} ${l.motorista ?? ""} ${l.romaneio ?? ""}`}
              colunas={[
                {
                  cabecalho: "Placa",
                  className: "whitespace-nowrap",
                  render: (l) => (
                    <button type="button" className="font-mono font-bold tracking-wider text-brand-primary hover:underline" onClick={() => setVeiculoAberto(l)} title="Ver os conhecimentos deste veículo">
                      {placaComHifen(l.placa)}
                    </button>
                  ),
                },
                { cabecalho: "Motorista", render: (l) => titulo(l.motorista) || "-" },
                { cabecalho: "Situação", render: (l) => <Badge variant={l.emOperacao ? "success" : "neutral"}>{l.emOperacao ? "Em operação" : l.baixado ? "Baixado" : "Disponível"}</Badge> },
                { cabecalho: "Romaneio", className: "whitespace-nowrap", render: (l) => l.romaneio ? <>Rota {l.romaneio} - Emissao: {formatDateBR(l.dataEmissao)}</> : "-" },
                { cabecalho: "Entregues", className: "text-right tabular-nums", render: (l) => (l.total ? `${l.realizadas}/${l.total}` : "-") },
                { cabecalho: "Pendentes", className: "text-right tabular-nums", render: (l) => <span className={l.pendentes ? "font-bold text-amber-600" : "text-brand-border"}>{l.pendentes}</span> },
                { cabecalho: "Insucessos", className: "text-right tabular-nums", render: (l) => <span className={l.insucessos ? "font-bold text-brand-red" : "text-brand-border"}>{l.insucessos}</span> },
              ]}
              onClose={fecharLista}
            />
          ) : null}

          {lista === "atrasados" ? (
            <ListaDialog<Atrasado>
              titulo="Entregas em atraso"
              descricao="previsão vencida nos últimos 30 dias, sem entrega"
              linhas={dados.atrasados}
              chave={(l) => l.ctrc}
              textoBusca={(l) => `${l.ctrc} ${l.numero_nf ?? ""} ${l.destinatario_nome ?? ""} ${l.entrega_cidade ?? ""}`}
              aoAbrir={(l) => abrirConhecimento(l.ctrc)}
              aviso={aviso}
              colunas={[
                { cabecalho: "CTRC", className: "whitespace-nowrap", render: (l) => <span className="font-semibold">{l.ctrc}</span> },
                { cabecalho: "NF", render: (l) => <NotasFiscaisInline numeroNf={l.numero_nf} onAbrir={() => abrirNotasFiscais(l.ctrc)} /> },
                { cabecalho: "Destinatário", render: (l) => <Pessoa nome={l.destinatario_nome} cidade={l.entrega_cidade} /> },
                { cabecalho: "Previsão", className: "whitespace-nowrap", render: (l) => formatDateBR(l.previsao_entrega) },
                { cabecalho: "Atraso", className: "whitespace-nowrap", render: (l) => <Badge variant="danger">{l.dias_atraso} {l.dias_atraso === 1 ? "dia" : "dias"}</Badge> },
                { cabecalho: "Localização", render: (l) => <span className="block max-w-56 truncate text-brand-border" title={l.localizacao_atual ?? undefined}>{l.localizacao_atual ?? "-"}</span> },
              ]}
              onClose={fecharLista}
            />
          ) : null}

          {lista === "aguardando" ? (
            <ListaDialog<Agendamento>
              titulo="Aguardando agendamento"
              descricao="o cliente ainda não confirmou a data"
              linhas={agendamentos.aguardando}
              chave={(l) => l.ctrc}
              textoBusca={(l) => `${l.ctrc} ${l.numero_nf ?? ""} ${l.destinatario_nome ?? ""} ${l.entrega_cidade ?? ""}`}
              aoAbrir={(l) => abrirConhecimento(l.ctrc)}
              aviso={aviso}
              colunas={[
                { cabecalho: "CTRC", className: "whitespace-nowrap", render: (l) => <span className="font-semibold">{l.ctrc}</span> },
                { cabecalho: "NF", render: (l) => <NotasFiscaisInline numeroNf={l.numero_nf} onAbrir={() => abrirNotasFiscais(l.ctrc)} /> },
                { cabecalho: "Destinatário", render: (l) => <Pessoa nome={l.destinatario_nome} cidade={l.entrega_cidade} /> },
                {
                  cabecalho: "Previsão",
                  className: "whitespace-nowrap",
                  render: (l) =>
                    l.previsao_entrega && l.previsao_entrega < hoje ? (
                      <span className="flex items-center gap-2">{formatDateBR(l.previsao_entrega)} <Badge variant="danger">Vencida</Badge></span>
                    ) : (
                      formatDateBR(l.previsao_entrega)
                    ),
                },
              ]}
              onClose={fecharLista}
            />
          ) : null}

          {lista === "agendados" ? (
            <ListaDialog<Agendamento>
              titulo="Entregas agendadas"
              descricao="ordenadas pela data combinada"
              linhas={[...agendamentos.agendadas].sort((a, b) => (a.entrega_programada ?? "9").localeCompare(b.entrega_programada ?? "9"))}
              chave={(l) => l.ctrc}
              textoBusca={(l) => `${l.ctrc} ${l.numero_nf ?? ""} ${l.destinatario_nome ?? ""} ${l.entrega_cidade ?? ""} ${l.romaneio ?? ""} ${l.placa ?? ""} ${l.motorista ?? ""} ${l.ocorrencia_codigo ?? ""} ${l.ocorrencia_descricao ?? ""}`}
              aoAbrir={(l) => abrirConhecimento(l.ctrc)}
              aviso={aviso}
              colunas={[
                { cabecalho: "CTRC", className: "whitespace-nowrap", render: (l) => <span className="font-semibold">{l.ctrc}</span> },
                { cabecalho: "NF", render: (l) => <NotasFiscaisInline numeroNf={l.numero_nf} onAbrir={() => abrirNotasFiscais(l.ctrc)} /> },
                { cabecalho: "Destinatário", render: (l) => <Pessoa nome={l.destinatario_nome} cidade={l.entrega_cidade} /> },
                {
                  cabecalho: "Agendada para",
                  className: "whitespace-nowrap",
                  render: (l) =>
                    l.entrega_programada && l.entrega_programada < hoje ? (
                      <span className="flex items-center gap-2">{formatDateBR(l.entrega_programada)} <Badge variant="danger">Data passou</Badge></span>
                    ) : (
                      <Badge variant="accent">{formatDateBR(l.entrega_programada)}</Badge>
                    ),
                },
                {
                  cabecalho: "ROMANEIO/ OCORRÊNCIA",
                  className: "min-w-64",
                  render: (l) => l.romaneio ? (
                    <div className="text-xs">
                      <span className="font-semibold">
                        {l.romaneio}
                        {l.ocorrencia_codigo ? ` - ${l.ocorrencia_codigo} ${rotuloOcorrencia(l.ocorrencia_codigo, l.ocorrencia_descricao)}${l.ocorrencia_data ? ` ${formatDateBR(l.ocorrencia_data)}` : ""}` : ""}
                      </span>
                      <span className="block text-brand-border">{formatDateBR(l.data_romaneio)} · {placaComHifen(l.placa) || "-"}</span>
                      <span className="block max-w-56 truncate text-brand-border" title={titulo(l.motorista)}>{titulo(l.motorista) || "Sem motorista"}</span>
                    </div>
                  ) : <span className="text-brand-border">-</span>,
                },
              ]}
              onClose={fecharLista}
            />
          ) : null}

          {lista === "pendencias" ? (
            <ListaDialog<Pendencia>
              titulo="Pendências abertas"
              descricao="entregas com insucesso"
              linhas={dados.pendencias}
              chave={(l) => `${l.romaneio}-${l.ctrc}`}
              textoBusca={(l) => `${l.ctrc} ${l.numero_nf ?? ""} ${l.destinatario_nome ?? ""} ${l.entrega_cidade ?? ""} ${l.motivo_insucesso ?? ""} ${l.motorista ?? ""} ${l.placa ?? ""}`}
              aoAbrir={(l) => abrirConhecimento(l.ctrc)}
              aviso={aviso}
              colunas={[
                {
                  cabecalho: "CTRC",
                  className: "whitespace-nowrap",
                  render: (l) => (
                    <div>
                      <span className="font-semibold">{l.ctrc}</span>
                      <span
                        className="mt-0.5 block max-w-52 truncate text-xs font-normal text-status-error"
                        title={[l.ocorrencia_codigo, titulo(l.motivo_insucesso)].filter(Boolean).join(" - ") || undefined}
                      >
                        {[l.ocorrencia_codigo, titulo(l.motivo_insucesso)].filter(Boolean).join(" - ") || "-"}
                      </span>
                    </div>
                  ),
                },
                { cabecalho: "NF", render: (l) => <NotasFiscaisInline numeroNf={l.numero_nf} onAbrir={() => abrirNotasFiscais(l.ctrc)} /> },
                { cabecalho: "Destinatário", render: (l) => <Pessoa nome={l.destinatario_nome} cidade={l.entrega_cidade} /> },
                
                { cabecalho: "Veículo", className: "whitespace-nowrap", render: (l) => <span className="font-mono text-xs font-bold tracking-wider">{placaComHifen(l.placa) || "-"}<span className="block font-sans text-xs font-normal tracking-normal text-brand-border">{titulo(l.motorista)}</span></span> },
              ]}
              onClose={fecharLista}
            />
          ) : null}
        </>
      ) : null}

      {veiculoAberto ? (
        <VeiculoDialog
          key={veiculoAberto.placa}
          veiculo={veiculoAberto}
          aoAbrirConhecimento={abrirConhecimento}
          aviso={aviso}
          onClose={() => {
            setVeiculoAberto(null);
            setAviso("");
          }}
        />
      ) : null}

      {detalhe ? <ConhecimentoDetalhe key={`${detalhe.dominio}:${detalhe.chave_linha}`} conhecimento={detalhe} onClose={() => setDetalhe(null)} /> : null}
      {notasDe ? <NotasFiscaisModal key={`${notasDe.dominio}:${notasDe.chave_linha}`} conhecimento={notasDe} onClose={() => setNotasDe(null)} /> : null}
    </div>
  );
}

function rotuloOcorrencia(codigo: string, descricao: string | null) {
  if (codigo === "15") return "ENTREGA AGENDADA";
  if (codigo === "35") return "AGUARDANDO AGENDAMENTO";
  return descricao || "";
}

function Pessoa({ nome, cidade }: { nome: string | null; cidade: string | null }) {
  return (
    <div className="max-w-64">
      <p className="truncate font-medium" title={nome ?? undefined}>{titulo(nome) || "-"}</p>
      {cidade ? <p className="truncate text-xs text-brand-border">{titulo(cidade)}</p> : null}
    </div>
  );
}
