import { type FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { changePassword } from "../../services/auth";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Modal } from "../ui/modal";

// Bloqueante: enquanto a senha for provisória o usuário só consegue trocá-la ou sair.
export function TrocaSenhaModal() {
  const { logout, refreshProfile } = useAuth();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (senha.length < 6) return setError("Informe uma senha com pelo menos 6 caracteres.");
    if (senha.trim() !== senha) return setError("A senha não deve iniciar ou terminar com espaços.");
    if (senha !== confirmacao) return setError("As senhas não conferem.");

    setSaving(true);
    setError("");
    try {
      await changePassword(senha);
      await refreshProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível trocar a senha.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title="Troque sua senha" className="max-w-md" hideHeader>
      <form className="space-y-4" onSubmit={submit}>
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
            <KeyRound className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold">Defina sua nova senha</h3>
            <p className="mt-1 text-sm leading-6 text-brand-border">Você entrou com uma senha provisória. Escolha uma senha pessoal para continuar.</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="nova-senha">Nova senha</Label>
          <Input id="nova-senha" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirma-senha">Confirmar nova senha</Label>
          <Input id="confirma-senha" type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
        </div>
        {error ? <div role="alert" className="rounded-md border border-status-error/25 bg-status-error/10 px-3 py-2 text-sm text-status-error">{error}</div> : null}
        <div className="flex justify-end gap-2 border-t border-brand-border/10 pt-4">
          <Button variant="secondary" disabled={saving} onClick={() => logout()}>Sair</Button>
          <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar senha"}</Button>
        </div>
      </form>
    </Modal>
  );
}
