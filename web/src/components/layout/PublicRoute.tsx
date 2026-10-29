import { Navigate, Outlet } from "react-router-dom";
import { LoadingScreen } from "../common/LoadingScreen";
import { useAuth } from "../../hooks/useAuth";

export function PublicRoute() {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user && profile) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
