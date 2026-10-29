import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { MODULOS, type ModuloChave } from "../../lib/modulos";
import { AcessoNegadoDialog } from "./AcessoNegadoDialog";

/** Primeiro módulo liberado para o usuário (destino padrão após o login ou depois de um acesso negado). */
export function useRotaInicial() {
  const { podeAcessar } = useAuth();
  return MODULOS.find((m) => podeAcessar(m.chave))?.rota ?? null;
}

/** Barra a rota de um módulo sem permissão e avisa com o diálogo do sistema. */
export function ModuloRoute({ modulo }: { modulo: ModuloChave }) {
  const { podeAcessar, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const inicial = useRotaInicial();
  const info = MODULOS.find((m) => m.chave === modulo);

  if (podeAcessar(modulo)) return <Outlet />;

  async function sair() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <AcessoNegadoDialog
      modulo={info?.rotulo ?? "solicitado"}
      rotuloFechar={inicial ? "Voltar" : "Entendi"}
      onClose={() => (inicial ? navigate(inicial, { replace: true, state: { de: location.pathname } }) : undefined)}
      aoSair={inicial ? undefined : sair}
    />
  );
}

/** "/" leva para o primeiro módulo liberado. */
export function RedirecionarInicio() {
  const inicial = useRotaInicial();
  const { logout } = useAuth();
  const navigate = useNavigate();
  if (inicial) return <Navigate to={inicial} replace />;
  return (
    <AcessoNegadoDialog
      modulo="do sistema"
      onClose={() => undefined}
      aoSair={async () => {
        await logout();
        navigate("/login", { replace: true });
      }}
    />
  );
}
