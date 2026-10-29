import { type ReactNode, createContext, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { ModuloChave } from "../lib/modulos";
import { signInWithPassword, signOut } from "../services/auth";
import { getProfile } from "../services/profiles";
import type { Profile } from "../types/profile";

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  /** Administrador acessa tudo; usuário só os módulos com o switch ligado. */
  podeAcessar: (modulo: ModuloChave) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Usuário autenticado sem profile ativo não entra: encerra a sessão e avisa.
  const loadProfile = useCallback(async (current: User | null) => {
    if (!current) {
      setProfile(null);
      return;
    }
    const found = await getProfile(current.id);
    if (!found || !found.ativo) {
      await signOut();
      setUser(null);
      setProfile(null);
      throw new Error(
        found ? "Usuário inativo. Entre em contato com o administrador." : "Cadastro de profissional não encontrado. Procure o administrador.",
      );
    }
    setProfile(found);
  }, []);

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!active) return;
        const sessionUser = data.session?.user ?? null;
        setUser(sessionUser);
        await loadProfile(sessionUser);
      } catch {
        if (active) {
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      // fora do callback: chamar o Supabase aqui dentro pode travar o cliente
      setTimeout(() => {
        loadProfile(sessionUser).catch(() => undefined).finally(() => setLoading(false));
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await signInWithPassword(email, password);
      setUser(data.user);
      await loadProfile(data.user);
    },
    [loadProfile],
  );

  const logout = useCallback(async () => {
    await signOut();
    setUser(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(() => loadProfile(user), [loadProfile, user]);

  const isAdmin = Boolean(profile?.administrador || profile?.tipo_usuario === "ADMINISTRADOR");

  const podeAcessar = useCallback((modulo: ModuloChave) => isAdmin || profile?.modulos_acesso?.[modulo] === true, [isAdmin, profile]);

  const value = useMemo(
    () => ({ user, profile, loading, isAdmin, podeAcessar, login, logout, refreshProfile }),
    [user, profile, loading, isAdmin, podeAcessar, login, logout, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
