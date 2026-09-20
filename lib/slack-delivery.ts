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

/**
 * Monta o aviso de handoff: a demanda saiu de uma etapa de Entrega e entrou
 * numa etapa de Entrada de outro grupo — é essa transição, e só ela, que
 * dispara a mensagem (ver o gatilho em `app/api/creator/cards/route.ts`).
 *
 * Formato exato pedido pela Raphael, sem emoji nem contagem de peças (o
 * antigo "📦 N peças 📦" saiu — a mensagem é sobre QUEM entregou e QUEM é o
 * próximo, não sobre volumetria, que já tem o próprio lugar no dash de
 * equipe).
 */
export function montarMensagemEntrega(params: {
  /** "MKT-42", já formatado — ver `formatCardCode`. */
  codigo: string;
  /** Link do card já aberto na plataforma. `null` quando o domínio público não pôde ser resolvido — entra sem link, nunca com um endereço local inútil pra quem lê no Slack. */
  cardUrl: string | null;
  /** Nome de quem tinha a demanda antes desta transição — quem a entregou. */
  responsavel: string;
  driveUrl: string;
  /** IDs do Slack (`U0123...`) do time do grupo pra onde a tarefa entrou. */
  mencoes: string[];
}): string {
  const idTexto = params.cardUrl ? `<${params.cardUrl}|${params.codigo}>` : params.codigo;
  const marcacoes = params.mencoes.map((id) => `<@${id}>`).join(" ");

  const linhas = [
    `A tarefa ${idTexto} foi entregue por ${params.responsavel}.`,
    `Link do Google Drive: ${params.driveUrl}`,
  ];
  if (marcacoes) linhas.push("", marcacoes);
  return linhas.join("\n");
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

/**
 * Slack de cada responsável, a partir do e-mail corporativo (`Creator.userEmail`
 * / `BoardGroup.assignees`) — é assim que a mensagem marca quem o QUADRO já diz
 * ser responsável pela demanda, em vez de exigir escolher de novo a cada
 * entrega (o que o ad-naming-tool do Pedro fazia, com um único nome fixo de
 * reserva quando ninguém escolhia). Usa `users.lookupByEmail`, um escopo a
 * mais (`users:read.email`) além dos que já lêem o canal.
 *
 * Quem não tem conta no workspace com esse e-mail — ou o escopo não foi dado —
 * simplesmente não aparece na lista; a mensagem sai do mesmo jeito, só sem
 * marcar essa pessoa. Uma falha de busca não pode impedir o aviso de sair.
 */
export async function buscarIdsSlackPorEmails(emails: string[]): Promise<string[]> {
  const creds = await lerCredenciaisSlack();
  const unicos = [...new Set(emails.filter(Boolean))];
  if (!creds || !unicos.length) return [];

  const ids = await Promise.all(
    unicos.map(async (email) => {
      try {
        const res = await fetch(`${SLACK_API}/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
          headers: { Authorization: `Bearer ${creds.botToken}` },
        });
        const json = await res.json();
        return json.ok && json.user ? (json.user.id as string) : null;
      } catch {
        return null;
      }
    })
  );

  return ids.filter((id): id is string => !!id);
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
