import { BarChart3, Building2, FileText, Radar, ReceiptText, Truck, UsersRound, type LucideIcon } from "lucide-react";

/** Módulos do menu lateral que podem ser liberados ou negados por usuário. */
export type ModuloChave = "dashboard" | "conhecimentos" | "entregas" | "faturamento" | "frete_entrega" | "empresa" | "profissionais";

/** Permissões por ação dentro de um módulo (guardadas na mesma coluna modulos_acesso). */
export type AcaoChave = "frete_entrega_incluir" | "frete_entrega_editar" | "frete_entrega_excluir";

export type ModuloAcesso = Partial<Record<ModuloChave | AcaoChave, boolean>>;

export const ACOES: { chave: AcaoChave; modulo: ModuloChave; rotulo: string }[] = [
  { chave: "frete_entrega_incluir", modulo: "frete_entrega", rotulo: "Incluir" },
  { chave: "frete_entrega_editar", modulo: "frete_entrega", rotulo: "Editar" },
  { chave: "frete_entrega_excluir", modulo: "frete_entrega", rotulo: "Excluir" },
];

export const MODULOS: { chave: ModuloChave; rotulo: string; rota: string; icone: LucideIcon; descricao: string }[] = [
  { chave: "dashboard", rotulo: "Dashboard", rota: "/dashboard", icone: BarChart3, descricao: "Indicadores e gráficos de gestão." },
  { chave: "conhecimentos", rotulo: "Conhecimentos", rota: "/conhecimentos", icone: FileText, descricao: "Lista de CTRC / CT-e do SSW." },
  { chave: "entregas", rotulo: "Entregas", rota: "/entregas", icone: Radar, descricao: "Painel de entregas, veículos e romaneios." },
  { chave: "faturamento", rotulo: "Faturamento", rota: "/faturamento", icone: ReceiptText, descricao: "Faturas, cobrança e situação financeira." },
  { chave: "frete_entrega", rotulo: "Frete entrega", rota: "/frete-entrega", icone: Truck, descricao: "Fretes pagos a motoristas, pagamento e nota fiscal." },
  { chave: "empresa", rotulo: "Empresa", rota: "/empresa", icone: Building2, descricao: "Dados da empresa, setores, cargos e filiais." },
  { chave: "profissionais", rotulo: "Profissionais", rota: "/profissionais", icone: UsersRound, descricao: "Cadastro e gestão dos usuários do sistema." },
];

export const moduloPorRota = (rota: string) => MODULOS.find((m) => rota === m.rota || rota.startsWith(`${m.rota}/`));

const TODAS_CHAVES: (ModuloChave | AcaoChave)[] = [...MODULOS.map((m) => m.chave), ...ACOES.map((a) => a.chave)];

/** Módulos e ações que um usuário novo NÃO recebe por padrão (precisam ser liberados de propósito). */
const RESTRITOS: (ModuloChave | AcaoChave)[] = ["frete_entrega", ...ACOES.map((a) => a.chave)];

/** Valores padrão de um usuário novo no formulário. */
export const todosLiberados = (): ModuloAcesso => Object.fromEntries(TODAS_CHAVES.map((c) => [c, !RESTRITOS.includes(c)])) as ModuloAcesso;

/**
 * Só aceita as chaves conhecidas, com valor booleano.
 * Administrador: chave ausente conta como liberada (só o que foi desligado de propósito fica negado).
 */
export function normalizarModulos(valor: unknown, administrador = false): ModuloAcesso {
  const origem = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  return Object.fromEntries(
    TODAS_CHAVES.map((c) => [c, administrador ? origem[c] !== false : origem[c] === true]),
  ) as ModuloAcesso;
}

/** Regra única de acesso: administrador só perde o que está explicitamente false; usuário precisa do true. */
export const permitido = (acesso: ModuloAcesso | null | undefined, chave: ModuloChave | AcaoChave, administrador: boolean) =>
  administrador ? acesso?.[chave] !== false : acesso?.[chave] === true;
