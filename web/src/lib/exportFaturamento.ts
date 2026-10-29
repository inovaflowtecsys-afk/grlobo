import jsPDF from "jspdf";
import autoTable, { type CellDef, type RowInput } from "jspdf-autotable";
import * as XLSX from "xlsx";
import { brand } from "./brand";
import { formatBRL, formatDateBR, toISODate } from "./format";
import type { CtrcFinanceiroItem, FaturaItem, SituacaoFinanceira } from "../types/faturamento";

/* ───────────────────────── Regras compartilhadas com a tela ───────────────────────── */

const SITUACAO_FATURA: Record<string, string> = { ABERTA: "A vencer", ATRASADA: "Vencida", LIQUIDADA: "Liquidada", CANCELADA: "Cancelada" };
const SITUACAO_CTRC: Record<SituacaoFinanceira, string> = {
  PENDENTE_FATURAMENTO: "A faturar",
  FATURADO: "Faturado",
  ATRASADO: "Vencida",
  CONCLUIDO: "Liquidado",
  CANCELADO: "Cancelado",
  SEM_INFORMACAO: "Sem informação",
};

function diasEntreISO(fim: string, inicio: string) {
  const [y1, m1, d1] = fim.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = inicio.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86_400_000);
}

/** Dias de atraso quando vencida; null quando não está vencida. */
function diasFatura(f: FaturaItem) {
  if (f.situacao !== "ATRASADA") return null;
  if (f.dias_atraso != null) return f.dias_atraso;
  return f.vencimento ? Math.max(diasEntreISO(toISODate(new Date()), f.vencimento), 0) : 0;
}

function diasCtrc(c: CtrcFinanceiroItem) {
  if (c.situacao_financeira !== "ATRASADO") return null;
  if (c.dias_atraso != null) return c.dias_atraso;
  return c.fatura_vencimento ? Math.max(diasEntreISO(toISODate(new Date()), c.fatura_vencimento), 0) : 0;
}

/** Texto da coluna "Dias vencidos": os dias quando vencida, "No Prazo" quando não, "-" quando cancelada. */
const textoDias = (dias: number | null, cancelada: boolean) => (cancelada ? "-" : dias == null ? "No Prazo" : `${dias} ${dias === 1 ? "dia" : "dias"}`);

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
const dataISO = (v: string | null | undefined) => (v ? v.slice(0, 10) : "");
const nomeArquivo = (base: string, ext: string) => `${base}-${toISODate(new Date())}.${ext}`;

/* ───────────────────────── Colunas ───────────────────────── */

type Coluna<T> = { titulo: string; tipo: "texto" | "data" | "dinheiro" | "inteiro"; largura: number; valor: (r: T) => string | number | null };

const colunasFaturas: Coluna<FaturaItem>[] = [
  { titulo: "Fatura", tipo: "texto", largura: 14, valor: (f) => f.fatura },
  { titulo: "Cliente", tipo: "texto", largura: 44, valor: (f) => f.cliente },
  { titulo: "CNPJ", tipo: "texto", largura: 20, valor: (f) => f.cnpj_cliente },
  { titulo: "Emissão", tipo: "data", largura: 12, valor: (f) => dataISO(f.emissao) },
  { titulo: "Vencimento", tipo: "data", largura: 12, valor: (f) => dataISO(f.vencimento) },
  { titulo: "Dias vencidos", tipo: "texto", largura: 14, valor: (f) => textoDias(diasFatura(f), f.situacao === "CANCELADA") },
  { titulo: "Situação", tipo: "texto", largura: 12, valor: (f) => SITUACAO_FATURA[f.situacao ?? ""] ?? f.situacao },
  { titulo: "Pagamento", tipo: "data", largura: 12, valor: (f) => dataISO(f.pagamento) },
  { titulo: "CTRCs", tipo: "inteiro", largura: 8, valor: (f) => num(f.qtd_ctrcs) },
  { titulo: "Valor", tipo: "dinheiro", largura: 15, valor: (f) => num(f.valor_fatura) },
  { titulo: "Pago", tipo: "dinheiro", largura: 15, valor: (f) => num(f.valor_pago) },
  { titulo: "Saldo", tipo: "dinheiro", largura: 15, valor: (f) => num(f.saldo) },
];

const colunasCtrcs: Coluna<CtrcFinanceiroItem>[] = [
  { titulo: "CTRC", tipo: "texto", largura: 14, valor: (c) => c.ctrc ?? c.cte },
  { titulo: "CT-e", tipo: "texto", largura: 12, valor: (c) => c.cte },
  { titulo: "Emissão", tipo: "data", largura: 12, valor: (c) => dataISO(c.data_autorizacao) },
  { titulo: "Pagador", tipo: "texto", largura: 44, valor: (c) => c.pagador_nome },
  { titulo: "CNPJ", tipo: "texto", largura: 20, valor: (c) => c.pagador_cnpj },
  { titulo: "Frete", tipo: "dinheiro", largura: 15, valor: (c) => num(c.valor_frete) },
  { titulo: "Situação", tipo: "texto", largura: 14, valor: (c) => SITUACAO_CTRC[c.situacao_financeira] ?? c.situacao_financeira },
  { titulo: "Fatura", tipo: "texto", largura: 14, valor: (c) => c.fatura },
  { titulo: "Vencimento", tipo: "data", largura: 12, valor: (c) => dataISO(c.fatura_vencimento) },
  { titulo: "Dias vencidos", tipo: "texto", largura: 14, valor: (c) => textoDias(diasCtrc(c), c.situacao_financeira === "CANCELADO") },
  { titulo: "Liquidado em", tipo: "data", largura: 12, valor: (c) => dataISO(c.data_liquidacao) },
  { titulo: "Valor liquidado", tipo: "dinheiro", largura: 15, valor: (c) => num(c.valor_liquidado) },
];

/* ───────────────────────── Excel ───────────────────────── */

function planilha<T>(nomeAba: string, arquivoBase: string, linhas: T[], colunas: Coluna<T>[], filtros: string, totais: Array<{ coluna: string; soma: boolean }>) {
  const cabecalho = colunas.map((c) => c.titulo);
  const dados = linhas.map((r) =>
    colunas.map((c) => {
      const v = c.valor(r);
      if (c.tipo === "data") return v ? new Date(`${v}T00:00:00`) : null;
      return v === "" ? null : v;
    }),
  );

  // linha de totais (somente colunas numéricas pedidas)
  const total = colunas.map((c, i) => {
    if (i === 0) return "TOTAL";
    const pedido = totais.find((t) => t.coluna === c.titulo);
    return pedido?.soma ? linhas.reduce((s, r) => s + num(c.valor(r) as number), 0) : null;
  });

  const ws = XLSX.utils.aoa_to_sheet([[`${brand.companyName} - ${nomeAba}`], [filtros], [], cabecalho, ...dados, total], { cellDates: true });
  ws["!cols"] = colunas.map((c) => ({ wch: c.largura }));
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: colunas.length - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: colunas.length - 1 } }];
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 3 + dados.length, c: colunas.length - 1 } }) };
  ws["!freeze"] = { xSplit: 0, ySplit: 4 };

  // formatos numéricos e de data
  colunas.forEach((c, i) => {
    const formato = c.tipo === "data" ? "dd/mm/yyyy" : c.tipo === "dinheiro" ? '"R$" #,##0.00' : c.tipo === "inteiro" ? "#,##0" : null;
    if (!formato) return;
    for (let r = 4; r <= 4 + dados.length; r += 1) {
      const cel = ws[XLSX.utils.encode_cell({ r, c: i })];
      if (cel && (cel.t === "n" || cel.t === "d")) cel.z = formato;
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nomeAba.slice(0, 31));
  XLSX.writeFile(wb, nomeArquivo(arquivoBase, "xlsx"), { cellDates: true });
}

export function exportFaturasExcel(linhas: FaturaItem[], filtros: string) {
  planilha("Faturas", "faturas", linhas, colunasFaturas, filtros, [
    { coluna: "CTRCs", soma: true },
    { coluna: "Valor", soma: true },
    { coluna: "Pago", soma: true },
    { coluna: "Saldo", soma: true },
  ]);
}

export function exportCtrcsExcel(linhas: CtrcFinanceiroItem[], filtros: string) {
  planilha("Conhecimentos", "conhecimentos", linhas, colunasCtrcs, filtros, [
    { coluna: "Frete", soma: true },
    { coluna: "Valor liquidado", soma: true },
  ]);
}

/* ───────────────────────── PDF ───────────────────────── */

const AZUL: [number, number, number] = [18, 67, 127];
const VERMELHO: [number, number, number] = [197, 72, 82];
const CINZA: [number, number, number] = [75, 83, 93];

/** O logo do sistema é SVG; o jsPDF precisa de imagem, então desenha o SVG num canvas. */
async function logoPng(): Promise<{ dados: string; largura: number; altura: number } | null> {
  try {
    const img = new Image();
    img.src = brand.logo;
    await img.decode();
    const escala = 4;
    const largura = img.naturalWidth || 200;
    const altura = img.naturalHeight || 60;
    const canvas = document.createElement("canvas");
    canvas.width = largura * escala;
    canvas.height = altura * escala;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dados: canvas.toDataURL("image/png"), largura, altura };
  } catch {
    return null;
  }
}

async function pdf<T>(titulo: string, arquivoBase: string, linhas: T[], colunas: Coluna<T>[], filtros: string, resumo: Array<[string, string]>, destaque: (r: T) => boolean, colunaSituacao: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const larguraPagina = doc.internal.pageSize.getWidth();
  const margem = 10;
  const logo = await logoPng();

  // cabeçalho
  if (logo) {
    const altura = 12;
    doc.addImage(logo.dados, "PNG", margem, 8, (altura * logo.largura) / logo.altura, altura);
  } else {
    doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(...AZUL).text(brand.companyName, margem, 15);
  }
  doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(...AZUL).text(titulo.toUpperCase(), larguraPagina - margem, 13, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...CINZA).text(filtros, larguraPagina - margem, 18, { align: "right", maxWidth: larguraPagina - 2 * margem - 60 });
  doc.setDrawColor(225, 228, 232).setLineWidth(0.3).line(margem, 23, larguraPagina - margem, 23);

  // resumo
  let x = margem;
  resumo.forEach(([rotulo, valor]) => {
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...CINZA).text(rotulo.toUpperCase(), x, 29);
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(10, 17, 25).text(valor, x, 35);
    x += 52;
  });

  const idxSituacao = colunas.findIndex((c) => c.titulo === colunaSituacao);
  const alinhaDireita = (tipo: Coluna<T>["tipo"]) => (tipo === "dinheiro" || tipo === "inteiro" ? "right" : "left");

  const corpo: RowInput[] = linhas.map((r) =>
    colunas.map((c): CellDef => {
      const v = c.valor(r);
      const texto = c.tipo === "data" ? (v ? formatDateBR(String(v)) : "-") : c.tipo === "dinheiro" ? formatBRL(num(v as number)) : v == null || v === "" ? "-" : String(v);
      return { content: texto, styles: { halign: alinhaDireita(c.tipo) } };
    }),
  );
  // linha de total das colunas monetárias
  const totalLinha: CellDef[] = colunas.map((c, i) => ({
    content: i === 0 ? "TOTAL" : c.tipo === "dinheiro" ? formatBRL(linhas.reduce((s, r) => s + num(c.valor(r) as number), 0)) : "",
    styles: { halign: alinhaDireita(c.tipo), fontStyle: "bold", fillColor: [230, 235, 242] },
  }));

  autoTable(doc, {
    startY: 40,
    margin: { left: margem, right: margem, bottom: 14 },
    head: [colunas.map((c) => ({ content: c.titulo, styles: { halign: alinhaDireita(c.tipo) } }))],
    body: [...corpo, totalLinha],
    theme: "striped",
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.6, textColor: [10, 17, 25], overflow: "ellipsize" },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 246, 249] },
    columnStyles: Object.fromEntries(colunas.map((c, i) => [i, { cellWidth: c.titulo === "Cliente" || c.titulo === "Pagador" ? 52 : "auto" }])),
    didParseCell: (d) => {
      if (d.section !== "body" || d.row.index >= linhas.length) return;
      // vencidas em vermelho (coluna de situação e de dias vencidos)
      if (destaque(linhas[d.row.index]) && (d.column.index === idxSituacao || colunas[d.column.index]?.titulo === "Dias vencidos")) {
        d.cell.styles.textColor = VERMELHO;
        d.cell.styles.fontStyle = "bold";
      }
    },
  });

  // rodapé em todas as páginas, já com o total de páginas conhecido
  const paginas = doc.getNumberOfPages();
  const altura = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= paginas; p += 1) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...CINZA);
    doc.text(`${brand.companyName} · ${brand.systemName} · emitido em ${new Date().toLocaleString("pt-BR")}`, margem, altura - 6);
    doc.text(`Página ${p} de ${paginas}`, larguraPagina - margem, altura - 6, { align: "right" });
  }

  doc.save(nomeArquivo(arquivoBase, "pdf"));
}

export function exportFaturasPdf(linhas: FaturaItem[], filtros: string) {
  const total = linhas.reduce((s, f) => s + num(f.valor_fatura), 0);
  const saldo = linhas.reduce((s, f) => s + num(f.saldo), 0);
  const vencidas = linhas.filter((f) => f.situacao === "ATRASADA");
  return pdf("Faturas", "faturas", linhas, colunasFaturas, filtros, [
    ["Faturas", String(linhas.length)],
    ["Valor total", formatBRL(total)],
    ["Saldo em aberto", formatBRL(saldo)],
    ["Vencidas", `${vencidas.length} · ${formatBRL(vencidas.reduce((s, f) => s + num(f.valor_fatura), 0))}`],
  ], (f) => f.situacao === "ATRASADA", "Situação");
}

export function exportCtrcsPdf(linhas: CtrcFinanceiroItem[], filtros: string) {
  const frete = linhas.reduce((s, c) => s + num(c.valor_frete), 0);
  const aFaturar = linhas.filter((c) => c.situacao_financeira === "PENDENTE_FATURAMENTO");
  const vencidos = linhas.filter((c) => c.situacao_financeira === "ATRASADO");
  return pdf("Conhecimentos", "conhecimentos", linhas, colunasCtrcs, filtros, [
    ["Conhecimentos", String(linhas.length)],
    ["Frete total", formatBRL(frete)],
    ["A faturar", `${aFaturar.length} · ${formatBRL(aFaturar.reduce((s, c) => s + num(c.valor_frete), 0))}`],
    ["Vencidos", `${vencidos.length} · ${formatBRL(vencidos.reduce((s, c) => s + num(c.valor_frete), 0))}`],
  ], (c) => c.situacao_financeira === "ATRASADO", "Situação");
}

/* ───────────────────────── Texto dos filtros ───────────────────────── */

export function descreverFiltros(f: { de: string; ate: string; cliente: string; numero: string; situacao: string }, rotuloSituacao: (chave: string) => string) {
  return [
    `Período: ${formatDateBR(f.de)} a ${formatDateBR(f.ate)}`,
    f.cliente.trim() ? `Cliente: ${f.cliente.trim()}` : "",
    f.numero.trim() ? `Número: ${f.numero.trim()}` : "",
    f.situacao ? `Situação: ${rotuloSituacao(f.situacao)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
