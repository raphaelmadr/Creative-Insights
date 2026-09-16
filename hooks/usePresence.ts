"use client";

/**
 * Quem está online, na visão desta aba.
 *
 * Cada aba bate um sinal de vida e recebe a lista de volta na mesma resposta.
 * Duas coisas fazem a lista não "piscar" na prática:
 *
 *  - a janela de presença é quatro vezes maior que o intervalo, então uma
 *    batida perdida (aba em segundo plano, rede lenta) não apaga ninguém;
 *  - voltar o foco à aba dispara uma batida imediata, porque o navegador
 *    estrangula temporizadores em segundo plano e a pessoa que volta de outra
 *    janela precisa reaparecer na hora, não no próximo intervalo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { PRESENCE_HEARTBEAT_MS, type PresenceUser } from "@/lib/presence";

export function usePresence() {
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";

  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [isReady, setIsReady] = useState(false);
  const isMounted = useRef(true);

  const beat = useCallback(async () => {
    try {
      const res = await fetch("/api/presence", { method: "POST" });
      if (!res.ok) return;

      const json = await res.json();
      if (!isMounted.current || !json?.success) return;

      setUsers(json.users || []);
      setIsReady(true);
    } catch {
      // Uma batida perdida é normal; a janela de presença existe para isso.
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    if (!isAuthenticated) return;

    beat();
    const timer = setInterval(beat, PRESENCE_HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", beat);

    return () => {
      isMounted.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", beat);
    };
  }, [isAuthenticated, beat]);

  return { users, isReady };
}
