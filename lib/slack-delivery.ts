/**
 * Aviso no Slack da entrega de criativos.
 *
 * Não existia integração de Slack ativa no Creative Insights antes deste
 * módulo — `lib/slack-sync.ts` foi removido quando as entregas passaram a ser
 * medidas pelo próprio quadro (ver `lib/kanban-deliveries.ts`), e
 * `slackBotToken`/`slackChannelId` ficaram guardados em `SystemSettings` sem
 * nenhuma rotina os lendo. Porta `lib/slack.js` do ad-naming-tool (Pedro
 * Pimenta), com uma diferença: usa só o Bot Token, via `chat.postMessage`, e
 * não um Incoming Webhook separado — o token já reaproveitado do Pedro
 * resolve postar e listar membros com a mesma credencial (decisão do board:
 * uma credencial a menos pra cadastrar).
 */

import prisma from "./prisma";

const SLACK_API = "https://slack.com/api";

export interface SlackCredentials {
  botToken: string;
  channelId: string;
}

export async function lerCredenciaisSlack(): Promise<SlackCredentials | null> {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: { slackBotToken: true, slackChannelId: true },
  });
  if (!settings?.slackBotToken || !settings?.slackChannelId) return null;
  return { botToken: settings.slackBotToken, channelId: settings.slackChannelId };
}

/** Monta a mensagem no mesmo formato do Pedro (`lib/slack.js:29-35`). */
export function montarMensagemEntrega(params: {
  nome: string;
  pecas: number;
  /** Texto já linkado, ex.: `<https://drive.google.com/...|MKT-42 · nome-do-lote>`. */
  conteudo: string;
  /** IDs do Slack (`U0123...`) de quem marcar. Vazio usa o padrão do time. */
  mencoes?: string[];
}): string {
  const n = Number(params.pecas);
  const qtdTxt = n > 0 ? `${n} peça${n === 1 ? "" : "s"}` : "";
  const marcacoes = (params.mencoes?.length ? params.mencoes : []).map((id) => `<@${id}>`).join(" ");
  const linhaFinal = marcacoes || null;

  return [
    `📦Nova demanda entregue por ${params.nome}!${qtdTxt ? " " + qtdTxt : ""} 📦`,
    "",
    params.conteudo,
    ...(linhaFinal ? ["", linhaFinal] : []),
  ].join("\n");
}

/**
 * Posta a mensagem no canal configurado, via `chat.postMessage` (Bot Token).
 *
 * Falha alta — quem chama decide se isso bloqueia algo ou só vira aviso em
 * Logs (ver o gatilho em `app/api/creator/cards/route.ts`, que trata a falta
 * de link de entrega e a falha de Slack como avisos, não erros que desfazem o
 * movimento do card).
 */
export async function enviarMensagemSlack(texto: string): Promise<void> {
  const creds = await lerCredenciaisSlack();
  if (!creds) throw new Error("Slack não configurado (slackBotToken/slackChannelId) — ver Configurações › Sistema.");

  const res = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.botToken}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel: creds.channelId, text: texto }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(`Slack recusou a mensagem: ${json.error || res.status}`);
  }
}

export interface MembroSlack {
  id: string;
  nome: string;
  foto: string;
}

/**
 * Gente do canal configurado, pra marcar na mensagem de entrega — porta de
 * `buscarMembrosCanal` (`lib/slack.js:44-72`). Cache de 10 min fica a cargo de
 * quem chama (a rota da API), não deste módulo — mesmo motivo do Pedro: é
 * sempre a mesma gente, sem razão pra bater no Slack a cada carregamento.
 */
export async function buscarMembrosCanal(): Promise<MembroSlack[]> {
  const creds = await lerCredenciaisSlack();
  if (!creds) throw new Error("Slack não configurado (slackBotToken/slackChannelId) — ver Configurações › Sistema.");

  const resMembros = await fetch(
    `${SLACK_API}/conversations.members?channel=${encodeURIComponent(creds.channelId)}&limit=200`,
    { headers: { Authorization: `Bearer ${creds.botToken}` } }
  );
  const jsonMembros = await resMembros.json();
  if (!jsonMembros.ok) throw new Error(`Slack recusou (conversations.members): ${jsonMembros.error}`);

  const ids: string[] = jsonMembros.members || [];
  const usuarios = await Promise.all(
    ids.map(async (id): Promise<MembroSlack | null> => {
      const r = await fetch(`${SLACK_API}/users.info?user=${id}`, {
        headers: { Authorization: `Bearer ${creds.botToken}` },
      });
      const j = await r.json();
      if (!j.ok || !j.user) return null;
      const u = j.user;
      if (u.is_bot || u.deleted || u.id === "USLACKBOT") return null;
      const nome = u.profile?.real_name || u.real_name || u.name;
      const foto = u.profile?.image_48 || u.profile?.image_72 || "";
      return { id: u.id, nome, foto };
    })
  );

  return usuarios
    .filter((u): u is MembroSlack => u != null)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
