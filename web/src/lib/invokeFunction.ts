import { supabase } from "./supabase";

// supabase.functions.invoke devolve só "non-2xx status code"; a mensagem real vem no corpo da resposta.
export async function invokeFunction<T = unknown>(name: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return data as T;

  const response = (error as { context?: Response }).context;
  if (response && typeof response.json === "function") {
    const payload = await response.json().catch(() => null);
    if (payload?.error) throw new Error(String(payload.error));
  }
  throw new Error("Não foi possível concluir a operação. Tente novamente.");
}
