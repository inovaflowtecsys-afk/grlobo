import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { AcessoNegadoDialog } from "./AcessoNegadoDialog";
import { useRotaInicial } from "./ModuloRoute";

/** Barra a rota para quem não é administrador (ex.: Importação SSW). A função do servidor também confere o perfil. */
export function AdminRoute({ nome }: { nome: string }) {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const inicial = useRotaInicial();

  if (isAdmin) return <Outlet />;

  return (
    <AcessoNegadoDialog
      modulo={nome}
      rotuloFechar="Voltar"
      onClose={() => (inicial ? navigate(inicial, { replace: true, state: { de: location.pathname } }) : undefined)}
    />
  );
}
