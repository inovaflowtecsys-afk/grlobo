import { type ChangeEvent, type DragEvent, type InputHTMLAttributes, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, FolderOpen, Loader2, RefreshCw, Upload, X } from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { cn } from "../lib/utils";
import { useAuth } from "../hooks/useAuth";
import { alterarImportacaoAutomatica, importarArquivo, lerConfigAutomatica, listarImportacoes, lerTexto, MAX_ARQUIVOS, motivoIgnorado, validarArquivo } from "../services/importacaoSsw";
import { type ConfigAutomatica, type Importacao, ROTULO_TIPO_IMPORTACAO, TIPOS_ESCOLHA } from "../types/importacaoSsw";

type Estado = "lendo" | "validando" | "pronto" | "importando" | "importado" | "erro";

type Item = {
  chave: string;
  nome: string;
  tamanho: number;
  estado: Estado;
  texto?: string;
  importacao?: Importacao;
  erro?: string;
  tipoEscolhido: string;
  referencia: string;
  sequencia: string;
  marcado: boolean;
};

const PASTA_ATTRS = { webkitdirectory: "", directory: "" } as unknown as InputHTMLAttributes<HTMLInputElement>;

const dataHora = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const tamanhoTexto = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const num = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR"));

function badgeStatus(status: string) {
  if (status === "validado") return <Badge variant="info">Validado</Badge>;
  if (status === "importado") return <Badge variant="success">Importado</Badge>;
  if (status === "recusado") return <Badge variant="danger">Recusado</Badge>;
  return <Badge variant="danger">Erro</Badge>;
}

export function ImportacaoSswPage() {
  const [itens, setItens] = useState<Item[]>([]);
  const [ignorados, setIgnorados] = useState<{ nome: string; motivo: string }[]>([]);
  const [autorizo, setAutorizo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [historico, setHistorico] = useState<Importacao[]>([]);
  const { user } = useAuth();
  const [config, setConfig] = useState<ConfigAutomatica | null>(null);
  const [erroConfig, setErroConfig] = useState("");
  const [alterandoConfig, setAlterandoConfig] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroOrigem, setFiltroOrigem] = useState("");
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [erroHistorico, setErroHistorico] = useState("");
  const pastaRef = useRef<HTMLInputElement>(null);
  const arquivosRef = useRef<HTMLInputElement>(null);

  const atualizar = useCallback((chave: string, mudanca: Partial<Item>) => {
    setItens((atual) => atual.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)));
  }, []);

  const carregarHistorico = useCallback(async () => {
    setCarregandoHistorico(true);
    setErroHistorico("");
    try {
      setHistorico(await listarImportacoes({ status: filtroStatus || undefined, tipo: filtroTipo || undefined, origem: filtroOrigem || undefined }));
    } catch (e) {
      setErroHistorico(e instanceof Error ? e.message : "Não foi possível carregar o histórico.");
    } finally {
      setCarregandoHistorico(false);
    }
  }, [filtroStatus, filtroTipo, filtroOrigem]);

  useEffect(() => {
    void carregarHistorico();
  }, [carregarHistorico]);

  useEffect(() => {
    lerConfigAutomatica().then(setConfig).catch((e) => setErroConfig(e instanceof Error ? e.message : "Não foi possível ler a configuração."));
  }, []);

  async function alternarAutomatica() {
    if (!config) return;
    setAlterandoConfig(true);
    setErroConfig("");
    try {
      setConfig(await alterarImportacaoAutomatica(!config.ativo, user?.id ?? null));
    } catch (e) {
      setErroConfig(e instanceof Error ? e.message : "Não foi possível alterar.");
    } finally {
      setAlterandoConfig(false);
    }
  }

  const ultimaAutomatica = historico.find((h) => h.origem === "automatica" && h.status === "importado");
  const ultimoErroAutomatico = historico.find((h) => h.origem === "automatica" && (h.status === "erro" || h.status === "recusado"));

  async function validar(chave: string, texto: string, nome: string, tipoEscolhido: string, referencia: string, sequencia: string) {
    atualizar(chave, { estado: "validando", erro: undefined });
    try {
      const imp = await validarArquivo({
        nome,
        conteudo: texto,
        tipo: tipoEscolhido === "auto" ? undefined : tipoEscolhido,
        referencia: referencia || undefined,
        sequencia: sequencia || undefined,
      });
      atualizar(chave, {
        estado: "pronto",
        importacao: imp,
        referencia: imp.referencia ?? referencia,
        sequencia: imp.sequencia ?? sequencia,
        marcado: imp.status === "validado",
      });
    } catch (e) {
      atualizar(chave, { estado: "erro", erro: e instanceof Error ? e.message : "Falha ao validar.", marcado: false });
    }
  }

  async function adicionar(lista: File[]) {
    if (!lista.length) return;
    setAutorizo(false);
    const aceitos: { file: File; chave: string }[] = [];
    const recusados: { nome: string; motivo: string }[] = [];
    for (const f of lista) {
      const motivo = motivoIgnorado(f);
      if (motivo) recusados.push({ nome: f.name, motivo });
      else aceitos.push({ file: f, chave: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 7)}` });
    }
    const limite = Math.max(0, MAX_ARQUIVOS - itens.length);
    for (const extra of aceitos.splice(limite)) recusados.push({ nome: extra.file.name, motivo: `Limite de ${MAX_ARQUIVOS} arquivos por vez.` });
    setIgnorados(recusados);
    setItens((atual) => [
      ...atual,
      ...aceitos.map(({ file, chave }) => ({ chave, nome: file.name, tamanho: file.size, estado: "lendo" as Estado, tipoEscolhido: "auto", referencia: "", sequencia: "", marcado: false })),
    ]);
    // um arquivo por vez: evita sobrecarregar a função
    for (const { file, chave } of aceitos) {
      try {
        const texto = await lerTexto(file);
        atualizar(chave, { texto });
        await validar(chave, texto, file.name, "auto", "", "");
      } catch (e) {
        atualizar(chave, { estado: "erro", erro: e instanceof Error ? e.message : "Não foi possível ler o arquivo." });
      }
    }
  }

  function aoEscolher(e: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = "";
    void adicionar(arquivos);
  }

  function aoSoltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastando(false);
    void adicionar(Array.from(e.dataTransfer.files ?? []));
  }

  const marcados = itens.filter((i) => i.marcado && i.estado === "pronto" && i.importacao?.status === "validado");

  async function importarMarcados() {
    if (!autorizo || !marcados.length) return;
    setImportando(true);
    for (const item of marcados) {
      if (!item.texto || !item.importacao) continue;
      atualizar(item.chave, { estado: "importando", erro: undefined });
      try {
        const r = await importarArquivo({
          importacao_id: item.importacao.id,
          nome: item.nome,
          conteudo: item.texto,
          referencia: item.referencia || undefined,
          sequencia: item.sequencia || undefined,
        });
        atualizar(item.chave, {
          importacao: r.importacao,
          estado: r.ok ? "importado" : "erro",
          erro: r.ok ? undefined : r.error || r.importacao.motivo || "Falha na importação.",
          marcado: false,
        });
      } catch (e) {
        atualizar(item.chave, { estado: "erro", erro: e instanceof Error ? e.message : "Falha na importação.", marcado: false });
      }
    }
    setAutorizo(false);
    setImportando(false);
    void carregarHistorico();
  }

  const ocupado = importando || itens.some((i) => i.estado === "lendo" || i.estado === "validando" || i.estado === "importando");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importação SSW"
        description="Importe à mão os relatórios do SSW (036, 455, 441 e 411) quando o robô não conseguir baixá-los. O sistema valida cada arquivo e registra no log; só grava depois da sua autorização, usando as mesmas funções do modo automático."
      />

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Importação automática (extensão do navegador)</CardTitle>
          {config ? (
            <Badge variant={config.ativo ? "success" : "neutral"}>{config.ativo ? "Ligada" : "Desligada"}</Badge>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-brand-border">
            A extensão instalada no navegador em que o SSW fica aberto busca os relatórios 036, 455 e financeiro nos mesmos horários do robô e os envia para cá. Cada arquivo passa pela mesma validação e é gravado pelas mesmas funções do modo automático. Se algum arquivo não for reconhecido, ele é recusado e nada é gravado.
          </p>
          {config ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant={config.ativo ? "danger" : "primary"} onClick={() => void alternarAutomatica()} disabled={alterandoConfig}>
                {alterandoConfig ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {config.ativo ? "Desligar importação automática" : "Ligar importação automática"}
              </Button>
              <span className="text-xs text-brand-border">
                Tipos permitidos: {config.tipos_permitidos.join(", ")} · limite de {config.limite_por_hora} importações por hora · alterado em {dataHora(config.atualizado_em)}
              </span>
            </div>
          ) : null}
          {erroConfig ? <p className="text-status-error" role="alert">{erroConfig}</p> : null}
          <p className="text-xs text-brand-border">
            Última importação automática: {ultimaAutomatica ? `${ROTULO_TIPO_IMPORTACAO[ultimaAutomatica.tipo] ?? ultimaAutomatica.tipo} em ${dataHora(ultimaAutomatica.importado_em ?? ultimaAutomatica.criado_em)}` : "nenhuma ainda"}
            {ultimoErroAutomatico ? ` · último problema: ${dataHora(ultimoErroAutomatico.criado_em)} (${ultimoErroAutomatico.motivo ?? ultimoErroAutomatico.status})` : ""}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>1. Importação manual: escolha a pasta ou os arquivos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={aoSoltar}
            className={cn("flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-8 text-center transition", arrastando ? "border-brand-primary bg-brand-primary/5" : "border-brand-border/30")}
          >
            <Upload className="size-8 text-brand-border" aria-hidden="true" />
            <p className="text-sm text-brand-border">Arraste os arquivos aqui ou use os botões. Só são aceitos os relatórios em texto (TXT/CSV).</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={() => pastaRef.current?.click()} disabled={importando}>
                <FolderOpen className="size-4" aria-hidden="true" /> Selecionar pasta
              </Button>
              <Button variant="secondary" onClick={() => arquivosRef.current?.click()} disabled={importando}>
                <FileText className="size-4" aria-hidden="true" /> Selecionar arquivos
              </Button>
            </div>
            <input ref={pastaRef} type="file" multiple className="hidden" onChange={aoEscolher} {...PASTA_ATTRS} />
            <input ref={arquivosRef} type="file" multiple className="hidden" onChange={aoEscolher} />
          </div>

          {ignorados.length ? (
            <div className="rounded-md border border-status-warning/40 bg-status-warning/10 p-3 text-sm" role="status">
              <p className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" aria-hidden="true" /> {ignorados.length} arquivo(s) ignorado(s)</p>
              <ul className="list-disc pl-5 text-brand-border">
                {ignorados.slice(0, 8).map((i) => <li key={i.nome + i.motivo}>{i.nome}: {i.motivo}</li>)}
                {ignorados.length > 8 ? <li>e mais {ignorados.length - 8}…</li> : null}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {itens.length ? (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>2. Confira a validação</CardTitle>
            <Button variant="ghost" onClick={() => { setItens([]); setIgnorados([]); setAutorizo(false); }} disabled={ocupado}>Limpar lista</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {itens.map((item) => {
              const imp = item.importacao;
              const importavel = imp?.status === "validado";
              return (
                <div key={item.chave} className="rounded-lg border border-brand-border/20 p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-4"
                      checked={item.marcado}
                      disabled={!importavel || item.estado !== "pronto" || importando}
                      onChange={(e) => atualizar(item.chave, { marcado: e.target.checked })}
                      aria-label={`Importar ${item.nome}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-all text-sm font-semibold">{item.nome} <span className="font-normal text-brand-border">· {tamanhoTexto(item.tamanho)}</span></p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {item.estado === "lendo" || item.estado === "validando" ? <span className="inline-flex items-center gap-1 text-xs text-brand-border"><Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> {item.estado === "lendo" ? "Lendo…" : "Validando…"}</span> : null}
                        {item.estado === "importando" ? <span className="inline-flex items-center gap-1 text-xs text-brand-border"><Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Importando…</span> : null}
                        {imp ? <>{badgeStatus(imp.status)}<Badge variant="neutral">{ROTULO_TIPO_IMPORTACAO[imp.tipo] ?? imp.tipo}</Badge></> : null}
                        {imp?.linhas != null && imp.status !== "recusado" ? <span className="text-xs text-brand-border">{num(imp.linhas)} linha(s)</span> : null}
                        {item.estado === "importado" && imp ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-status-success">
                            <CheckCircle2 className="size-3.5" aria-hidden="true" /> {num(imp.novos)} novos · {num(imp.atualizados)} atualizados · {num(imp.iguais)} sem alteração
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <button type="button" className="rounded-md p-1 text-brand-border hover:bg-brand-muted disabled:opacity-40" disabled={ocupado} onClick={() => setItens((a) => a.filter((i) => i.chave !== item.chave))} aria-label={`Remover ${item.nome}`}>
                      <X className="size-4" />
                    </button>
                  </div>

                  {imp?.motivo || item.erro ? (
                    <p className="mt-3 rounded-md bg-status-error/10 p-2 text-sm text-status-error" role="alert">{item.erro || imp?.motivo}</p>
                  ) : null}
                  {imp?.avisos?.length ? (
                    <ul className="mt-3 list-disc rounded-md bg-status-warning/10 p-2 pl-6 text-sm text-amber-800">
                      {imp.avisos.map((a) => <li key={a}>{a}</li>)}
                    </ul>
                  ) : null}

                  {imp && item.estado !== "importado" && item.estado !== "importando" ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <label className="text-xs font-semibold text-brand-border">
                        Tipo do relatório
                        <select
                          className="mt-1 h-10 w-full rounded-md border border-brand-border/40 bg-white px-2 text-sm text-brand-dark"
                          value={item.tipoEscolhido}
                          disabled={ocupado}
                          onChange={(e) => {
                            atualizar(item.chave, { tipoEscolhido: e.target.value });
                            if (item.texto) void validar(item.chave, item.texto, item.nome, e.target.value, item.referencia, item.sequencia);
                          }}
                        >
                          {TIPOS_ESCOLHA.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-brand-border">
                        Período (036)
                        <Input className="mt-1" placeholder="ex.: 171026-201026" value={item.referencia} disabled={ocupado} onChange={(e) => atualizar(item.chave, { referencia: e.target.value })} />
                      </label>
                      <label className="text-xs font-semibold text-brand-border">
                        Sequência (455 e financeiro)
                        <Input className="mt-1" placeholder="opcional" value={item.sequencia} disabled={ocupado} onChange={(e) => atualizar(item.chave, { sequencia: e.target.value })} />
                      </label>
                    </div>
                  ) : null}
                  {imp?.cabecalho?.length && imp.status === "recusado" ? (
                    <p className="mt-2 break-words text-xs text-brand-border">Colunas lidas: {imp.cabecalho.slice(0, 20).join(", ")}</p>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {itens.length ? (
        <Card>
          <CardHeader>
            <CardTitle>3. Autorize a importação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-4" checked={autorizo} disabled={!marcados.length || importando} onChange={(e) => setAutorizo(e.target.checked)} />
              <span>
                Autorizo gravar no banco de dados os <strong>{marcados.length}</strong> arquivo(s) marcados. A gravação atualiza por chave (não duplica) e fica registrada no histórico com o meu usuário.
              </span>
            </label>
            <Button onClick={() => void importarMarcados()} disabled={!autorizo || !marcados.length || ocupado}>
              {importando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
              Importar {marcados.length ? `${marcados.length} arquivo(s)` : ""}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Histórico de importações</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-9 rounded-md border border-brand-border/40 bg-white px-2 text-sm" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} aria-label="Filtrar por status">
              <option value="">Todos os status</option>
              <option value="validado">Validado</option>
              <option value="importado">Importado</option>
              <option value="recusado">Recusado</option>
              <option value="erro">Erro</option>
            </select>
            <select className="h-9 rounded-md border border-brand-border/40 bg-white px-2 text-sm" value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value)} aria-label="Filtrar por origem">
              <option value="">Manual e automática</option>
              <option value="manual">Manual</option>
              <option value="automatica">Automática</option>
            </select>
            <select className="h-9 rounded-md border border-brand-border/40 bg-white px-2 text-sm" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} aria-label="Filtrar por tipo">
              <option value="">Todos os tipos</option>
              {["036", "455", "441", "411", "435", "desconhecido", "ambiguo"].map((t) => <option key={t} value={t}>{ROTULO_TIPO_IMPORTACAO[t]}</option>)}
            </select>
            <Button variant="secondary" onClick={() => void carregarHistorico()} disabled={carregandoHistorico}>
              <RefreshCw className={cn("size-4", carregandoHistorico && "animate-spin")} aria-hidden="true" /> Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {erroHistorico ? <p className="p-5 text-sm text-status-error" role="alert">{erroHistorico}</p> : null}
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-brand-muted text-xs uppercase text-brand-border">
              <tr>
                <th className="px-4 py-3">Data</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3">Usuário</th><th className="px-4 py-3">Arquivo</th><th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Linhas</th><th className="px-4 py-3 text-right">Novos</th><th className="px-4 py-3 text-right">Atual.</th><th className="px-4 py-3 text-right">Iguais</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((h) => (
                <tr key={h.id} className="border-t border-brand-border/10 align-top">
                  <td className="whitespace-nowrap px-4 py-3">{dataHora(h.criado_em)}</td>
                  <td className="px-4 py-3">{h.origem === "automatica" ? <Badge variant="accent">Automática</Badge> : <Badge variant="neutral">Manual</Badge>}</td>
                  <td className="px-4 py-3">{h.usuario_nome ?? "—"}</td>
                  <td className="break-all px-4 py-3">
                    {h.nome_arquivo}
                    {h.motivo ? <p className="mt-1 text-xs text-status-error">{h.motivo}</p> : null}
                  </td>
                  <td className="px-4 py-3">{ROTULO_TIPO_IMPORTACAO[h.tipo] ?? h.tipo}</td>
                  <td className="px-4 py-3">{badgeStatus(h.status)}</td>
                  <td className="px-4 py-3 text-right">{num(h.linhas)}</td>
                  <td className="px-4 py-3 text-right">{num(h.novos)}</td>
                  <td className="px-4 py-3 text-right">{num(h.atualizados)}</td>
                  <td className="px-4 py-3 text-right">{num(h.iguais)}</td>
                </tr>
              ))}
              {!historico.length && !carregandoHistorico && !erroHistorico ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-brand-border">Nenhuma importação registrada ainda.</td></tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
