"use client";

import { useEffect, useState } from "react";

/**
 * O relógio da tela.
 *
 * Existe para um rótulo de tempo relativo — "em 7 min", "há 2 h" — continuar
 * andando sem que nada seja buscado de novo. Era isso que faltava no estado da
 * sincronização: o dado era lido uma vez na montagem e o texto derivado dele
 * ficava congelado, de modo que "a qualquer momento" era o que a tela dizia
 * tanto no primeiro segundo quanto seis horas depois.
 *
 * O passo padrão é de 30s porque nada aqui se mede em segundos; um tique por
 * minuto atrasaria a virada em até 59s, e um por segundo redesenharia o
 * cabeçalho 60 vezes para mudar nada.
 */
export function useNow(stepMs: number = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const relogio = setInterval(() => setNow(new Date()), stepMs);
    return () => clearInterval(relogio);
  }, [stepMs]);

  return now;
}
