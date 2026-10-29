import { BarChart3, Building2, FileText, Radar, ReceiptText, UsersRound, type LucideIcon } from "lucide-react";

/** Módulos do menu lateral que podem ser liberados ou negados por usuário. */
export type ModuloChave = "dashboard" | "conhecimentos" | "entregas" | "faturamento" | "empresa" | "profissionais";

export type ModuloAcesso = Partial<Record<ModuloChave, boolean>>;

export const MODULOS: { chave: ModuloChave; rotulo: string; rota: string; icone: LucideIcon; descricao: string }[] = [
  { chave: "dashboard", rotulo: "Dashboard", rota: "/dashboard", icone: BarChart3, descricao: "Indicadores e gráficos de gestão." },
  { chave: "conhecimentos", rotulo: "Conhecimentos", rota: "/conhecimentos", icone: FileText, descricao: "Lista de CTRC / CT-e do SSW." },
  { chave: "entregas", rotulo: "Entregas", rota: "/entregas", icone: Radar, descricao: "Painel de entregas, veículos e romaneios." },
  { chave: "faturamento", rotulo: "Faturamento", rota: "/faturamento", icone: ReceiptText, descricao: "Faturas, cobrança e situação financeira." },
  { chave: "empresa", rotulo: "Empresa", rota: "/empresa", icone: Building2, descricao: "Dados da empresa, setores, cargos e filiais." },
  { chave: "profissionais", rotulo: "Profissionais", rota: "/profissionais", icone: UsersRound, descricao: "Cadastro e gestão dos usuários do sistema." },
];

export const moduloPorRota = (rota: string) => MODULOS.find((m) => rota === m.rota || rota.startsWith(`${m.rota}/`));

/** Todos os módulos liberados (padrão de um usuário novo no formulário). */
export const todosLiberados = (): ModuloAcesso => Object.fromEntries(MODULOS.map((m) => [m.chave, true])) as ModuloAcesso;

/** Só aceita as chaves conhecidas, com valor booleano. */
export function normalizarModulos(valor: unknown): ModuloAcesso {
  const origem = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  return Object.fromEntries(MODULOS.map((m) => [m.chave, origem[m.chave] === true])) as ModuloAcesso;
}
