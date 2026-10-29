import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { carregarGestaoAVista } from "../services/gestaoAVista";

type Dados = Awaited<ReturnType<typeof carregarGestaoAVista>>;
export type EstadoLive = "conectando" | "ao-vivo" | "reconectando";

const DEBOUNCE_MS = 1_500;
const FALLBACK_MS = 60_000;

/**
 * Mantém os dados da gestão à vista em dia: recarrega quando public.ctrc_painel muda (Realtime, com debounce
 * porque cada carga do SSW faz delete+insert em lote), a cada 60 s por segurança e ao reconectar.
 * Os dados anteriores continuam na tela durante o recarregamento.
 */
export function useGestaoAVista() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState<number | null>(null);
  const [live, setLive] = useState<EstadoLive>("conectando");
  const emVoo = useRef(false);

  const carregar = useCallback(async () => {
    if (emVoo.current) return;
    emVoo.current = true;
    try {
      setDados(await carregarGestaoAVista());
      setErro("");
      setAtualizadoEm(Date.now());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar a gestão à vista.");
    } finally {
      emVoo.current = false;
    }
  }, []);

  useEffect(() => {
    let debounce: number | undefined;
    const agendar = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(carregar, DEBOUNCE_MS);
    };

    carregar();
    const canal = supabase
      .channel("gestao-a-vista")
      .on("postgres_changes", { event: "*", schema: "public", table: "ctrc_painel" }, agendar)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLive("ao-vivo");
          carregar();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setLive("reconectando");
        }
      });
    const fallback = window.setInterval(() => {
      if (document.visibilityState === "visible") carregar();
    }, FALLBACK_MS);

    return () => {
      window.clearTimeout(debounce);
      window.clearInterval(fallback);
      void supabase.removeChannel(canal);
    };
  }, [carregar]);

  return { dados, erro, atualizadoEm, live, recarregar: carregar };
}
