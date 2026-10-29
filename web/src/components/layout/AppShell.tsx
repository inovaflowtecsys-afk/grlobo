import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, Building2, FileText, Handshake, Radar, Lock, LogOut, Menu, ReceiptText, Route, UsersRound, X } from "lucide-react";
import { brand } from "../../lib/brand";
import { cn } from "../../lib/utils";
import { useAuth } from "../../hooks/useAuth";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { AcessoNegadoDialog } from "./AcessoNegadoDialog";
import { TrocaSenhaModal } from "./TrocaSenhaModal";
import { moduloPorRota } from "../../lib/modulos";
import { joinUnique } from "../../lib/format";

const navGroups = [
  { label: "Principal", items: [{ label: "Dashboard", to: "/dashboard", icon: BarChart3 }] },
  {
    label: "Relatórios",
    items: [
      { label: "Conhecimentos", to: "/conhecimentos", icon: FileText },
      { label: "Entregas", to: "/entregas", icon: Radar },
      { label: "Operações", to: "/operacoes", icon: Route },
      { label: "Comercial", to: "/comercial", icon: Handshake },
      { label: "Faturamento", to: "/faturamento", icon: ReceiptText },
    ],
  },
  { label: "Cadastros", items: [
      { label: "Empresa", to: "/empresa", icon: Building2 },
      { label: "Profissionais", to: "/profissionais", icon: UsersRound },
    ],
  },
];

const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/conhecimentos": "Conhecimentos",
  "/entregas": "Entregas",
  "/operacoes": "Operações",
  "/comercial": "Comercial",
  "/faturamento": "Faturamento",
  "/empresa": "Empresa",
  "/profissionais": "Profissionais",
};

export function AppShell() {
  const { profile, user, isAdmin, podeAcessar, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [bloqueado, setBloqueado] = useState<string | null>(null);

  const displayName = profile?.nome || user?.email || "Usuário";
  const filial = profile?.filial ? joinUnique([profile.filial.sigla, profile.filial.nome]) : "";
  const context = [profile?.setor?.nome || profile?.cargo, filial].filter(Boolean).join(" · ");
  const groups = navGroups;

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-brand-surface text-brand-dark lg:h-screen lg:overflow-hidden lg:grid lg:grid-cols-[272px_1fr]">
      {open ? <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" /> : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-72 -translate-x-full flex-col bg-brand-dark text-white transition-transform lg:static lg:w-auto lg:translate-x-0",
          open && "translate-x-0",
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-6">
          <img src={brand.logoWhite} alt={brand.companyName} className="h-12 w-48 object-contain object-left" />
          <button type="button" className="rounded-md p-1 text-white/70 hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu">
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-4 py-5" aria-label="Navegação principal">
          {groups.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="px-3 pb-1 text-[11px] font-bold uppercase text-white/35">{group.label}</p>
                {group.items.filter((item) => !["/operacoes", "/comercial"].includes(item.to)).map((item) => (
                (() => {
                  const modulo = moduloPorRota(item.to);
                  const negado = Boolean(modulo) && !podeAcessar(modulo!.chave);
                  const classes = ({ isActive }: { isActive: boolean }) =>
                    cn(
                      "flex min-h-11 items-center gap-3 rounded-lg px-4 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white",
                      isActive && !negado && "bg-brand-primary text-white shadow-[0_12px_30px_rgba(18,67,127,0.45)] hover:bg-brand-primary",
                      negado && "text-white/40",
                    );
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={(event) => {
                        if (negado) {
                          event.preventDefault();
                          setBloqueado(item.label);
                          return;
                        }
                        setOpen(false);
                      }}
                      className={classes}
                      aria-disabled={negado || undefined}
                      title={negado ? "Sem permissão de acesso" : undefined}
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className="flex-1">{item.label}</span>
                      {negado ? <Lock className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                    </NavLink>
                  );
                })()
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 px-5 py-4 text-[10px] font-medium text-white/35">Inovaflowtec - vers&atilde;o 1.2.3 - 22/10/2026</div>
      </aside>

      <div className="min-h-0 min-w-0 lg:flex lg:flex-col">
        <header className="sticky top-0 z-10 flex min-h-20 items-center justify-between gap-4 border-b border-brand-border/15 bg-white/90 px-4 backdrop-blur-xl md:px-7">
          <div className="flex items-center gap-3">
            <button type="button" className="rounded-md p-2 hover:bg-brand-muted lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
              <Menu className="size-5" />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase text-brand-accent">{brand.companyName}</p>
              <h1 className="text-xl font-bold">{routeTitles[location.pathname] ?? brand.systemName}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-48 truncate text-sm font-semibold">{displayName}</p>
              <p className="max-w-64 truncate text-xs text-brand-border">{context || (isAdmin ? "Administrador" : "Usuário")}</p>
            </div>
            <Avatar name={displayName} imageUrl={profile?.avatar_url} />
            <Button variant="ghost" className="px-3" onClick={handleLogout} aria-label="Sair">
              <LogOut className="size-4" aria-hidden="true" />
              <span className="hidden md:inline">Sair</span>
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      {profile?.senha_provisoria ? <TrocaSenhaModal /> : null}
          {bloqueado ? <AcessoNegadoDialog modulo={bloqueado} onClose={() => setBloqueado(null)} /> : null}
    </div>
  );
}
