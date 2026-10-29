import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { LoadingScreen } from "./components/common/LoadingScreen";
import { useAuth } from "./hooks/useAuth";
import { ModuloRoute, RedirecionarInicio } from "./components/layout/ModuloRoute";
import { PublicRoute } from "./components/layout/PublicRoute";
import { ConhecimentosPage } from "./pages/ConhecimentosPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FaturamentoPage } from "./pages/FaturamentoPage";
import { EntregasPage } from "./pages/EntregasPage";
import { GestaoAVistaPage } from "./pages/GestaoAVistaPage";
import { EmpresaPage } from "./pages/EmpresaPage";
import { LoginPage } from "./pages/LoginPage";
import { RecuperarSenhaPage } from "./pages/RecuperarSenhaPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { ProfissionaisPage } from "./pages/ProfissionaisPage";

export function App() {
  return (
    <Routes>
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/recuperar-senha" element={<RecuperarSenhaPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route element={<ModuloRoute modulo="dashboard" />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>
          <Route element={<ModuloRoute modulo="conhecimentos" />}>
            <Route path="/conhecimentos" element={<ConhecimentosPage />} />
          </Route>
          <Route element={<ModuloRoute modulo="entregas" />}>
            <Route path="/entregas" element={<EntregasPage />} />
          </Route>
          <Route path="/operacoes" element={<PlaceholderPage title="Operações" />} />
          <Route path="/comercial" element={<PlaceholderPage title="Comercial" />} />
          <Route element={<ModuloRoute modulo="faturamento" />}>
            <Route path="/faturamento" element={<FaturamentoPage />} />
          </Route>
        </Route>
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<ModuloRoute modulo="entregas" />}>
          <Route path="/entregas/gestao-a-vista" element={<GestaoAVistaPage />} />
        </Route>
        <Route element={<AppShell />}>
          <Route element={<ModuloRoute modulo="empresa" />}>
            <Route path="/empresa" element={<EmpresaPage />} />
          </Route>
          <Route element={<ModuloRoute modulo="profissionais" />}>
            <Route path="/profissionais" element={<ProfissionaisPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/" element={<InicioProtegido />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

// "/" precisa de sessão: quem não entrou vai para o login; quem entrou vai ao primeiro módulo liberado.
function InicioProtegido() {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user || !profile) return <Navigate to="/login" replace />;
  return <RedirecionarInicio />;
}
