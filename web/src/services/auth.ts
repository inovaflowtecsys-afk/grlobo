import { invokeFunction } from "../lib/invokeFunction";
import { supabase } from "../lib/supabase";

const CREDENCIAIS_INVALIDAS = "E-mail ou senha inválidos.";

/**
 * Entra com e-mail e senha. Se a senha digitada tiver 6 dígitos e não for a senha da conta, tenta como o código
 * recebido por e-mail (senha provisória): o servidor valida o código e libera uma senha temporária para esta sessão.
 * Nesse caso o perfil fica com senha_provisoria = true e o app exige a troca antes de liberar o sistema.
 */
export async function signInWithPassword(email: string, password: string) {
  const normalizado = email.trim().toLowerCase();

  const direto = await supabase.auth.signInWithPassword({ email: normalizado, password });
  if (!direto.error && direto.data.user) return direto.data;

  if (/^\d{6}$/.test(password)) {
    const temporaria = await trocarCodigoPorSenha(normalizado, password);
    if (temporaria) {
      const sessao = await supabase.auth.signInWithPassword({ email: normalizado, password: temporaria });
      if (!sessao.error && sessao.data.user) return sessao.data;
    }
  }

  const mensagem = direto.error?.message;
  throw new Error(mensagem && mensagem !== "Invalid login credentials" ? mensagem : CREDENCIAIS_INVALIDAS);
}

async function trocarCodigoPorSenha(email: string, codigo: string) {
  try {
    const data = await invokeFunction<{ senha_temporaria?: string }>("auth-login-codigo", { email, codigo });
    return data?.senha_temporaria ?? null;
  } catch {
    return null;
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Define a senha definitiva de quem entrou com senha provisória e encerra a pendência de troca. */
export async function changePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
  const { error: rpcError } = await supabase.rpc("concluir_troca_senha");
  if (rpcError) throw new Error(rpcError.message);
}

/** Pede o envio do código de verificação por e-mail (a resposta é a mesma exista o e-mail ou não). */
export async function requestPasswordCode(email: string) {
  const data = await invokeFunction<{ message?: string }>("auth-forgot-password", { email: email.trim().toLowerCase() });
  return data?.message || "Se o e-mail estiver cadastrado, enviaremos um código de verificação.";
}

export async function resetPasswordWithCode(email: string, codigo: string, novaSenha: string) {
  const data = await invokeFunction<{ message?: string }>("auth-reset-password", {
    email: email.trim().toLowerCase(),
    codigo,
    nova_senha: novaSenha,
  });
  return data?.message || "Senha definida com sucesso.";
}
