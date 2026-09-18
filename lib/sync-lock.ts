/**
 * A trava global da sincronização: uma execução por vez, para toda a instalação.
 *
 * O botão "Sincronizar Redes" não tinha trava nenhuma. `isSyncingAll` vivia no
 * estado do navegador de quem clicou, o que impedia o segundo clique **daquela
 * pessoa** e mais nada: outra aba, outro computador, outra pessoa — cada um
 * abria a sua varredura completa da Meta e do TikTok, contra as mesmas APIs e
 * as mesmas linhas do banco. Com onze contas e o painel aberto o dia todo, é o
 * caminho curto para tomar limite de taxa da Meta e para dois processos
 * disputarem os mesmos upserts.
 *
 * O cron tinha meia solução — a reivindicação atômica da janela em
 * `lib/cron-endpoint.ts` —, mas ela só protegia as batidas umas das outras. Uma
 * batida automática e um clique manual continuavam podendo rodar juntos.
 *
 * Por que no banco, e não em memória do processo: no cPanel o Passenger pode
 * servir em mais de um processo, e o cron entra pela mesma porta que o botão.
 * Uma variável de módulo só travaria o processo que a viu.
 *
 * Por que um sinal de vida, e não um prazo fixo desde o início: um prazo longo
 * o bastante para a execução mais lenta (a sincronização pode levar ~5 min)
 * deixaria o botão desabilitado por cinco minutos toda vez que um processo
 * morresse no meio — deploy, timeout, queda de rede. O sinal de vida inverte
 * isso: a execução viva renova a cada 20s e a morta libera em 90s.
 */

import { randomBytes } from "crypto";
import prisma from "./prisma";

/** Sem sinal de vida por este tempo, a trava é considerada abandonada. */
export const LOCK_STALE_MS = 90 * 1000;

/** De quanto em quanto tempo uma execução viva renova o sinal. */
const HEARTBEAT_MS = 20 * 1000;

/** O nome que a tela mostra quando quem disparou foi o disparador externo. */
export const AUTOMATIC_HOLDER = "Sincronização automática";

export interface SyncLockHolder {
  /** Quem disparou — nome da pessoa, ou `AUTOMATIC_HOLDER`. */
  by: string;
  /** Início da execução, em ISO. */
  startedAt: string;
}

type LockRow = {
  syncLockToken: string | null;
  syncLockBy: string | null;
  syncLockStartedAt: Date | null;
  syncLockBeatAt: Date | null;
};

/**
 * Quem detém a trava agora, ou `null` se está livre.
 *
 * Aceita a linha já lida para quem acabou de buscá-la — é o caso do resumo de
 * configurações, que não deveria ir ao banco duas vezes pela mesma linha.
 */
export function readSyncLock(row: LockRow | null | undefined, now: Date = new Date()): SyncLockHolder | null {
  if (!row?.syncLockToken || !row.syncLockStartedAt) return null;

  const beat = row.syncLockBeatAt ?? row.syncLockStartedAt;
  if (now.getTime() - beat.getTime() > LOCK_STALE_MS) return null;

  return {
    by: row.syncLockBy || AUTOMATIC_HOLDER,
    startedAt: row.syncLockStartedAt.toISOString(),
  };
}

export async function currentSyncLock(now: Date = new Date()): Promise<SyncLockHolder | null> {
  const row = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: {
      syncLockToken: true,
      syncLockBy: true,
      syncLockStartedAt: true,
      syncLockBeatAt: true,
    },
  });
  return readSyncLock(row, now);
}

export type AcquireResult =
  | { ok: true; token: string }
  | { ok: false; holder: SyncLockHolder };

/**
 * Tenta tomar a trava.
 *
 * A condição do `UPDATE` é o portão — não há leitura seguida de escrita, que é
 * onde dois cliques simultâneos passariam os dois. O banco decide, e só uma das
 * chamadas vê `count > 0`.
 */
export async function acquireSyncLock(by: string): Promise<AcquireResult> {
  const now = new Date();
  const token = randomBytes(12).toString("hex");
  const staleBefore = new Date(now.getTime() - LOCK_STALE_MS);

  const result = await prisma.systemSettings.updateMany({
    where: {
      id: 1,
      OR: [
        { syncLockToken: null },
        { syncLockBeatAt: null },
        { syncLockBeatAt: { lt: staleBefore } },
      ],
    },
    data: {
      syncLockToken: token,
      syncLockBy: by,
      syncLockStartedAt: now,
      syncLockBeatAt: now,
    },
  });

  if (result.count > 0) return { ok: true, token };

  /*
   * Perdeu a disputa: devolve QUEM está segurando, para a resposta poder dizer
   * "Fulano começou há 2 min" em vez de um 409 mudo. Se a trava tiver sido
   * solta entre o UPDATE e esta leitura, a segunda tentativa resolve — e é o
   * cliente que decide tentar de novo, não este módulo.
   */
  const holder = await currentSyncLock(now);
  return {
    ok: false,
    holder: holder ?? { by: AUTOMATIC_HOLDER, startedAt: now.toISOString() },
  };
}

/**
 * Renova a trava de uma execução que continua em outra requisição.
 *
 * Existe por causa do botão manual, que é UM clique e DUAS requisições —
 * `/api/sync-all` e depois `/api/sync-media`, porque as duas passadas não cabem
 * numa só. Sem isto, haveria um instante entre elas em que a trava está livre e
 * outra pessoa poderia entrar no meio do trabalho de quem já estava rodando.
 *
 * Devolve `false` quando o token não é mais o dono — a execução foi considerada
 * abandonada e outra pessoa assumiu. Quem chama decide se tenta tomar de novo.
 */
export async function renewSyncLock(token: string): Promise<boolean> {
  const result = await prisma.systemSettings.updateMany({
    where: { id: 1, syncLockToken: token },
    data: { syncLockBeatAt: new Date() },
  });
  return result.count > 0;
}

/** Solta a trava, mas só se ela ainda for desta execução. */
export async function releaseSyncLock(token: string): Promise<void> {
  await prisma.systemSettings.updateMany({
    where: { id: 1, syncLockToken: token },
    data: {
      syncLockToken: null,
      syncLockBy: null,
      syncLockStartedAt: null,
      syncLockBeatAt: null,
    },
  });
}

/**
 * Executa `fn` com a trava tomada, renovando-a enquanto durar.
 *
 * O sinal de vida é um temporizador próprio, e não um gancho no progresso da
 * sincronização: o progresso é irregular por natureza — uma fonte pode ficar
 * minutos numa página da API antes de ter o que reportar — e uma execução viva
 * não pode ser dada como morta por estar num trecho silencioso.
 *
 * `onBusy` recebe quem está segurando, para a rota responder no seu próprio
 * formato (NDJSON numa, JSON na outra) em vez de este módulo escolher por ela.
 */
export async function withSyncLock<T>(
  by: string,
  fn: (token: string) => Promise<T>,
  onBusy: (holder: SyncLockHolder) => T
): Promise<T> {
  const lock = await acquireSyncLock(by);
  if (!lock.ok) return onBusy(lock.holder);

  const batida = setInterval(() => {
    renewSyncLock(lock.token).catch(() => {
      // Falha de rede num sinal de vida não derruba a sincronização: o próximo
      // renova, e o prazo de 90s cobre várias perdas seguidas.
    });
  }, HEARTBEAT_MS);

  try {
    return await fn(lock.token);
  } finally {
    clearInterval(batida);
    await releaseSyncLock(lock.token).catch(() => {
      // Sem soltar, o prazo do sinal de vida libera em 90s.
    });
  }
}
