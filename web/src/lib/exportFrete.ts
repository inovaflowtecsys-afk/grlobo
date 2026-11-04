import jsPDF from "jspdf";
import autoTable, { type CellDef, type RowInput } from "jspdf-autotable";
import * as XLSX from "xlsx";
import { brand } from "./brand";
import { logoPng } from "./exportFaturamento";
import { formatBRL, formatDateBR, formatDateTimeBR, toISODate } from "./format";
import type { FreteListItem, FretesQuery } from "../types/frete";

const AZUL: [number, number, number] = [18, 67, 127];
const CINZA: [number, number, number] = [75, 83, 93];
const AMBAR: [number, number, number] = [180, 83, 9];
const VERDE: [number, number, number] = [21, 128, 61];

type Coluna = {
  titulo: string;
  tipo: "texto" | "datahora" | "dinheiro";
  largura: number;
  /** Colunas longas (observação) ficam só na planilha. */
  soExcel?: boolean;
  valor: (r: FreteListItem) => string | number | null;
};

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

const colunas: Coluna[] = [
  { titulo: "Data", tipo: "datahora", largura: 17, valor: (r) => r.data_registro },
  { titulo: "Motorista", tipo: "texto", largura: 38, valor: (r) => r.motorista?.nome ?? "" },
  { titulo: "Valor do frete", tipo: "dinheiro", largura: 15, valor: (r) => num(r.valor_frete) },
  { titulo: "Chapa", tipo: "dinheiro", largura: 13, valor: (r) => num(r.valor_chapa) },
  { titulo: "Descarga", tipo: "dinheiro", largura: 13, valor: (r) => num(r.valor_descarga) },
  { titulo: "Adicional", tipo: "dinheiro", largura: 13, valor: (r) => num(r.valor_adicional) },
  { titulo: "Pagamento", tipo: "texto", largura: 12, valor: (r) => (r.pago ? "Pago" : "Pendente") },
  { titulo: "Data do pagamento", tipo: "datahora", largura: 17, valor: (r) => r.data_pagamento },
  { titulo: "Nota fiscal", tipo: "texto", largura: 16, valor: (r) => r.nota_fiscal ?? "" },
  { titulo: "Observação", tipo: "texto", largura: 50, soExcel: true, valor: (r) => r.observacao ?? "" },
];

const nomeArquivo = (ext: string) => `frete-entrega-${toISODate(new Date())}.${ext}`;

/** Texto dos filtros aplicados, para o cabeçalho dos arquivos. */
export function descreverFiltrosFrete(q: FretesQuery, nomeMotorista: string) {
  const periodo = q.de || q.ate ? `Período: ${q.de ? formatDateBR(q.de) : "início"} a ${q.ate ? formatDateBR(q.ate) : "hoje"}` : "Período: todos";
  return [
    periodo,
    q.motoristaId && nomeMotorista ? `Motorista: ${nomeMotorista}` : "",
    q.notaFiscal.trim() ? `Nota fiscal: ${q.notaFiscal.trim()}` : "",
    q.pago !== "todos" ? `Pagamento: ${q.pago === "pago" ? "pagos" : "pendentes"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Data/hora no horário de Brasília como "relógio de parede", para o Excel não deslocar o horário. */
function relogioSP(iso: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return new Date(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
}

export function exportFretesExcel(linhas: FreteListItem[], filtros: string) {
  const cols = colunas;
  const dados = linhas.map((r) =>
    cols.map((c) => {
      const v = c.valor(r);
      if (c.tipo === "datahora") return v ? relogioSP(String(v)) : null;
      return v === "" ? null : v;
    }),
  );
  const total = cols.map((c, i) => (i === 0 ? "TOTAL" : c.tipo === "dinheiro" ? linhas.reduce((s, r) => s + num(c.valor(r) as number), 0) : null));

  const ws = XLSX.utils.aoa_to_sheet([[`${brand.companyName} - Frete entrega`], [filtros], [], cols.map((c) => c.titulo), ...dados, total], { cellDates: true });
  ws["!cols"] = cols.map((c) => ({ wch: c.largura }));
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: cols.length - 1 } }];
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 3 + dados.length, c: cols.length - 1 } }) };
  ws["!freeze"] = { xSplit: 0, ySplit: 4 };

  cols.forEach((c, i) => {
    const formato = c.tipo === "datahora" ? "dd/mm/yyyy hh:mm" : c.tipo === "dinheiro" ? '"R$" #,##0.00' : null;
    if (!formato) return;
    for (let r = 4; r <= 4 + dados.length; r += 1) {
      const cel = ws[XLSX.utils.encode_cell({ r, c: i })];
      if (cel && (cel.t === "n" || cel.t === "d")) cel.z = formato;
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Frete entrega");
  XLSX.writeFile(wb, nomeArquivo("xlsx"), { cellDates: true });
}

export async function exportFretesPdf(linhas: FreteListItem[], filtros: string) {
  const cols = colunas.filter((c) => !c.soExcel);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const larguraPagina = doc.internal.pageSize.getWidth();
  const margem = 10;
  const logo = await logoPng();

  if (logo) {
    const altura = 12;
    doc.addImage(logo.dados, "PNG", margem, 8, (altura * logo.largura) / logo.altura, altura);
  } else {
    doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(...AZUL).text(brand.companyName, margem, 15);
  }
  doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(...AZUL).text("FRETE ENTREGA", larguraPagina - margem, 13, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...CINZA).text(filtros, larguraPagina - margem, 18, { align: "right", maxWidth: larguraPagina - 2 * margem - 60 });
  doc.setDrawColor(225, 228, 232).setLineWidth(0.3).line(margem, 23, larguraPagina - margem, 23);

  const soma = (lista: FreteListItem[]) => lista.reduce((s, r) => s + num(r.valor_frete), 0);
  const pagos = linhas.filter((r) => r.pago);
  const pendentes = linhas.filter((r) => !r.pago);
  const resumo: Array<[string, string]> = [
    ["Fretes", String(linhas.length)],
    ["Valor do frete", formatBRL(soma(linhas))],
    ["Pagos", `${pagos.length} · ${formatBRL(soma(pagos))}`],
    ["Pendentes", `${pendentes.length} · ${formatBRL(soma(pendentes))}`],
  ];
  let x = margem;
  resumo.forEach(([rotulo, valor]) => {
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...CINZA).text(rotulo.toUpperCase(), x, 29);
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(10, 17, 25).text(valor, x, 35);
    x += 56;
  });

  const direita = (tipo: Coluna["tipo"]) => (tipo === "dinheiro" ? "right" : "left");
  const corpo: RowInput[] = linhas.map((r) =>
    cols.map((c): CellDef => {
      const v = c.valor(r);
      const texto = c.tipo === "datahora" ? (v ? formatDateTimeBR(String(v)) : "-") : c.tipo === "dinheiro" ? formatBRL(num(v as number)) : v == null || v === "" ? "-" : String(v);
      return { content: texto, styles: { halign: direita(c.tipo) } };
    }),
  );
  const totalLinha: CellDef[] = cols.map((c, i) => ({
    content: i === 0 ? "TOTAL" : c.tipo === "dinheiro" ? formatBRL(linhas.reduce((s, r) => s + num(c.valor(r) as number), 0)) : "",
    styles: { halign: direita(c.tipo), fontStyle: "bold", fillColor: [230, 235, 242] },
  }));
  const idxPagamento = cols.findIndex((c) => c.titulo === "Pagamento");

  autoTable(doc, {
    startY: 40,
    margin: { left: margem, right: margem, bottom: 14 },
    head: [cols.map((c) => ({ content: c.titulo, styles: { halign: direita(c.tipo) } }))],
    body: [...corpo, totalLinha],
    theme: "striped",
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.6, textColor: [10, 17, 25], overflow: "ellipsize" },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 246, 249] },
    columnStyles: Object.fromEntries(cols.map((c, i) => [i, { cellWidth: c.titulo === "Motorista" ? 62 : "auto" }])),
    didParseCell: (d) => {
      if (d.section !== "body" || d.row.index >= linhas.length || d.column.index !== idxPagamento) return;
      d.cell.styles.fontStyle = "bold";
      d.cell.styles.textColor = linhas[d.row.index].pago ? VERDE : AMBAR;
    },
  });

  const paginas = doc.getNumberOfPages();
  const altura = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= paginas; p += 1) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...CINZA);
    doc.text(`${brand.companyName} · ${brand.systemName} · emitido em ${new Date().toLocaleString("pt-BR")}`, margem, altura - 6);
    doc.text(`Página ${p} de ${paginas}`, larguraPagina - margem, altura - 6, { align: "right" });
  }

  doc.save(nomeArquivo("pdf"));
}
