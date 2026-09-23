/**
 * A linha de configuração DA AUTENTICAÇÃO, guardada por alguns segundos.
 *
 * Toda requisição autenticada lia `SystemSettings` duas vezes antes de chegar
 * ao trabalho de verdade: uma para descobrir o endereço público de retorno
 * (`ensureAuthUrlEnv`) e outra para montar as credenciais do Google
 * (`getAuthOptions`). Some-se a busca do usuário e são três idas ao banco antes
 * da primeira linha de resposta.
 *
 * Isso era invisível enquanto o banco estava ao lado. Não está: o MySQL é o da
 * hospedagem, e cada ida custa cerca de 160ms medidos daqui. Três idas são
 * meio segundo gasto antes de a rota começar — em toda tela, o tempo todo.
 *
 * O que estas duas leituras buscam quase nunca muda: o id e o segredo do
 * cliente OAuth, e a URL pública. São dados de instalação, não de operação.
 * Guardá-los por trinta segundos troca meio segundo por requisição por, no
 * pior caso, meio minuto de atraso para uma credencial recém-trocada — e nem
 * isso, porque quem grava as configurações limpa o cache na mesma ação.
 *
 * NÃO serve para ler o resto da tabela. `lastSyncAt`, a trava da
 * sincronização e os carimbos do cron mudam a todo instante e são justamente o
 * que as telas ficam observando; lidos daqui, apareceriam parados. Quem precisa
 * deles vai ao banco — ver `app/api/settings/summary`.
 */

import type { SystemSettings } from "@prisma/client";
import prisma from "./prisma";

const TTL = 30_000;

let cache: { em: number; linha: SystemSettings | null } | null = null;

export async function configuracaoDaAutenticacao(): Promise<SystemSettings | null> {
  const agora = Date.now();
  if (cache && agora - cache.em < TTL) return cache.linha;

  /*
   * Falha de banco não derruba o login: sem a linha, as credenciais caem para
   * as variáveis de ambiente, que é exatamente o que acontecia antes deste
   * módulo existir. Guardar o erro no cache seria repeti-lo por trinta
   * segundos, então ele não entra.
   */
  try {
    const linha = await prisma.systemSettings.findUnique({ where: { id: 1 } });
    cache = { em: agora, linha };
    return linha;
  } catch {
    return cache?.linha ?? null;
  }
}

/** Chamada por quem grava as configurações — a troca de credencial vale na hora. */
export function esquecerConfiguracaoDaAutenticacao(): void {
  cache = null;
}
