/**
 * Quem está na plataforma agora.
 *
 * Não existe conexão aberta para consultar: o deploy é serverless, onde uma
 * conexão viva é uma função viva. Cada aba manda um sinal de vida em intervalo
 * fixo e "online" passa a ser uma pergunta sobre o relógio — quem deu sinal
 * dentro da janela. É por isso que a janela é várias vezes maior que o
 * intervalo: uma batida perdida por uma aba em segundo plano, uma requisição
 * lenta ou um relógio ocupado não pode apagar alguém da lista.
 */

/** De quanto em quanto tempo cada aba avisa que continua aberta. */
export const PRESENCE_HEARTBEAT_MS = 30_000;

/** De quanto em quanto tempo o topo da tela relê a lista. */
export const PRESENCE_POLL_MS = 30_000;

/** Quanto tempo sem sinal até a pessoa sair da lista. */
export const PRESENCE_WINDOW_MS = 120_000;

export interface PresenceUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  lastSeenAt: string | null;
  /** `true` para a pessoa que fez a requisição. */
  isSelf: boolean;
}

/** O instante a partir do qual um sinal de vida ainda conta como "online". */
export function presenceThreshold(now: Date = new Date()): Date {
  return new Date(now.getTime() - PRESENCE_WINDOW_MS);
}

export function isOnline(lastSeenAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!lastSeenAt) return false;
  return lastSeenAt.getTime() >= presenceThreshold(now).getTime();
}
