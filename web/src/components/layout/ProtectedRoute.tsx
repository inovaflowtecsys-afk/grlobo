import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoadingScreen } from "../common/LoadingScreen";
import { useAuth } from "../../hooks/useAuth";

export function ProtectedRoute({ adminOnly = false }: { adminOnly?: boolean }) {
  const { user, profile, loading, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (!user || !profile) return <Navigate to="/login" replace state={{ from: location }} />;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
