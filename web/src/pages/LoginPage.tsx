import { type FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { brand } from "../lib/brand";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { from?: { pathname?: string }; message?: string } | null;
  const redirectTo = locationState?.from?.pathname || "/dashboard";
  const successMessage = locationState?.message;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(redirectTo, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível autenticar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-brand-dark">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,#12437f_0%,#0a1119_60%)]" aria-hidden="true" />
      <div className="absolute -right-32 -top-32 size-96 rounded-full bg-brand-accent/15 blur-3xl" aria-hidden="true" />

      <div className="relative z-10 grid min-h-0 flex-1 items-center gap-10 px-5 py-8 lg:grid-cols-[1fr_460px] lg:px-12 xl:px-20">
        <section className="hidden max-w-3xl text-white lg:block">
          <img src={brand.logoWhite} alt={brand.companyName} className="mb-10 h-20 w-80 object-contain object-left" />
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-brand-accent backdrop-blur">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Ambiente restrito a colaboradores
          </p>
          <h1 className="max-w-2xl text-5xl font-bold leading-tight">Relatórios e KPIs de operações, comercial e faturamento.</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/70">{brand.tagline}.</p>
        </section>

        <section className="mx-auto w-full max-w-md lg:mx-0">
          <Card className="border-white bg-white shadow-[0_30px_100px_rgba(0,0,0,0.45)]">
            <CardContent className="p-6 sm:p-8">
              <img src={brand.logo} alt={brand.companyName} className="mx-auto mb-2 h-16 w-64 object-contain" />
              <p className="mb-7 text-center text-sm font-semibold text-brand-border">{brand.systemName}</p>

              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-border" />
                    <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 pl-10" placeholder="usuario@grupolobo.com.br" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="password">Senha</Label>
                    <Link to={email.trim() ? `/recuperar-senha?email=${encodeURIComponent(email.trim())}` : "/recuperar-senha"} className="text-xs font-semibold text-brand-primary transition hover:underline">
                      Esqueci a senha
                    </Link>
                  </div>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-border" />
                    <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 pl-10 pr-10" placeholder="Senha ou código recebido por e-mail" />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-brand-border transition hover:bg-brand-muted"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                {successMessage ? (
                  <div role="status" className="rounded-md border border-status-success/25 bg-status-success/10 px-3 py-2 text-sm text-status-success">
                    {successMessage}
                  </div>
                ) : null}

                {error ? (
                  <div role="alert" className="rounded-md border border-status-error/25 bg-status-error/10 px-3 py-2 text-sm text-status-error">
                    {error}
                  </div>
                ) : null}

                <Button type="submit" className="h-12 w-full" disabled={submitting}>
                  {submitting ? "Entrando..." : "Entrar"}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>

      <footer className="relative z-10 shrink-0 pb-4 text-center text-[10px] font-medium tracking-wide text-white/35">
        Inovaflowtec - vers&atilde;o 1.2.3 - 22/10/2026
      </footer>
    </main>
  );
}
