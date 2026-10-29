import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, KeyRound, LockKeyhole, Mail } from "lucide-react";
import { brand } from "../lib/brand";
import { requestPasswordCode, resetPasswordWithCode } from "../services/auth";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

const REENVIO_SEGUNDOS = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RecuperarSenhaPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const emailInicial = params.get("email") ?? "";
  // chegando pelo link do e-mail (?email=) o usuário já tem o código: vai direto ao passo 2
  const [passo, setPasso] = useState<"email" | "codigo">(emailInicial ? "codigo" : "email");
  const [email, setEmail] = useState(emailInicial);
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [espera, setEspera] = useState(0);

  useEffect(() => {
    if (espera <= 0) return;
    const timer = window.setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [espera]);

  async function enviarCodigo(event?: FormEvent) {
    event?.preventDefault();
    setError("");
    if (!EMAIL_RE.test(email.trim())) return setError("Informe um e-mail válido.");

    setEnviando(true);
    try {
      setInfo(await requestPasswordCode(email));
      setPasso("codigo");
      setEspera(REENVIO_SEGUNDOS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar o código.");
    } finally {
      setEnviando(false);
    }
  }

  async function redefinir(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!EMAIL_RE.test(email.trim())) return setError("Informe um e-mail válido.");
    if (codigo.length !== 6) return setError("O código tem 6 dígitos.");
    if (senha.length < 6) return setError("A senha deve ter pelo menos 6 caracteres.");
    if (senha.trim() !== senha) return setError("A senha não deve iniciar ou terminar com espaços.");
    if (senha !== confirmacao) return setError("As senhas não conferem.");

    setEnviando(true);
    try {
      const message = await resetPasswordWithCode(email, codigo, senha);
      navigate("/login", { replace: true, state: { message } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível redefinir a senha.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-dark px-5 py-8">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,#12437f_0%,#0a1119_60%)]" aria-hidden="true" />
      <div className="absolute -right-32 -top-32 size-96 rounded-full bg-brand-accent/15 blur-3xl" aria-hidden="true" />

      <Card className="relative z-10 w-full max-w-md border-white bg-white shadow-[0_30px_100px_rgba(0,0,0,0.45)]">
        <CardContent className="p-6 sm:p-8">
          <img src={brand.logo} alt={brand.companyName} className="mx-auto mb-2 h-14 w-56 object-contain" />
          <h1 className="mt-4 text-center text-lg font-bold">Recuperar senha</h1>
          <p className="mb-6 mt-1 text-center text-sm text-brand-border">
            {passo === "email" ? "Informe seu e-mail para receber um código de verificação." : "Informe o código recebido por e-mail e escolha uma nova senha."}
          </p>

          {passo === "email" ? (
            <form className="space-y-5" onSubmit={enviarCodigo} noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-border" />
                  <Input id="email" type="email" autoComplete="email" className="h-12 pl-10" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@grupolobo.com.br" />
                </div>
              </div>
              <Feedback error={error} />
              <Button type="submit" className="h-12 w-full" disabled={enviando}>
                {enviando ? "Enviando..." : "Enviar código"}
              </Button>
              <button type="button" className="block w-full text-center text-sm font-semibold text-brand-primary hover:underline" onClick={() => { setError(""); setPasso("codigo"); }}>
                Já tenho um código
              </button>
            </form>
          ) : (
            <form className="space-y-5" onSubmit={redefinir} noValidate>
              {info ? <p role="status" className="rounded-md border border-brand-accent/30 bg-brand-accent/10 px-3 py-2 text-sm text-brand-primary">{info}</p> : null}
              <div className="space-y-2">
                <Label htmlFor="email2">E-mail</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-border" />
                  <Input id="email2" type="email" autoComplete="email" className="h-12 pl-10" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="codigo">Código de verificação</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-border" />
                  <Input
                    id="codigo"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="h-12 pl-10 text-lg font-semibold tracking-[0.4em]"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nova-senha">Nova senha</Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-border" />
                  <Input id="nova-senha" type="password" autoComplete="new-password" className="h-12 pl-10" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo de 6 caracteres" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirma-senha">Confirmar nova senha</Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-border" />
                  <Input id="confirma-senha" type="password" autoComplete="new-password" className="h-12 pl-10" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
                </div>
              </div>
              <Feedback error={error} />
              <Button type="submit" className="h-12 w-full" disabled={enviando}>
                {enviando ? "Salvando..." : "Definir nova senha"}
              </Button>
              <button
                type="button"
                className="block w-full text-center text-sm font-semibold text-brand-primary hover:underline disabled:text-brand-border disabled:no-underline"
                disabled={enviando || espera > 0}
                onClick={() => enviarCodigo()}
              >
                {espera > 0 ? `Reenviar código em ${espera}s` : "Enviar um novo código"}
              </button>
            </form>
          )}

          <Link to="/login" className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-brand-border transition hover:text-brand-dark">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Voltar para o login
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}

function Feedback({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="rounded-md border border-status-error/25 bg-status-error/10 px-3 py-2 text-sm text-status-error">
      {error}
    </div>
  ) : null;
}
