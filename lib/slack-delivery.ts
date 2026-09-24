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
 *
 * O gatilho de QUANDO avisar é configurável por etapa
 * (`BoardColumn.notifySlackOnEnter`, ver `app/api/creator/cards/route.ts`) —
 * este módulo só sabe montar e enviar a mensagem. Canal e texto também podem
 * ser sobrescritos por etapa (`BoardColumn.slackChannelId`/
 * `slackMessageTemplate`); em branco, cai no canal global e no formato padrão
 * de entrega abaixo.
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
 * Monta o aviso de handoff: card entrou numa etapa marcada com
 * `notifySlackOnEnter` (ver o gatilho em `app/api/creator/cards/route.ts`).
 *
 * Formato padrão exato pedido pela Raphael, sem emoji nem contagem de peças
 * (o antigo "📦 N peças 📦" saiu — a mensagem é sobre QUEM entregou e QUEM é
 * o próximo, não sobre volumetria, que já tem o próprio lugar no dash de
 * equipe). Uma etapa pode substituir esse formato por `template` — texto
 * livre com os placeholders `{{tarefa}}`, `{{responsavel}}`, `{{drive}}` e
 * `{{marcacoes}}` (ver `BoardColumn.slackMessageTemplate` e os botões de
 * inserção em `ColumnsSection.tsx`).
 */
export function montarMensagemEntrega(params: {
  /** "MKT-42", já formatado — ver `formatCardCode`. */
  codigo: string;
  /** Link do card já aberto na plataforma. `null` quando o domínio público não pôde ser resolvido — entra sem link, nunca com um endereço local inútil pra quem lê no Slack. */
  cardUrl: string | null;
  /** Nome de quem tinha a demanda antes desta transição — quem a entregou. */
  responsavel: string;
  driveUrl: string | null;
  /** IDs do Slack (`U0123...`) do time do grupo pra onde a tarefa entrou. */
  mencoes: string[];
  /** Texto customizado da etapa. Ausente/vazio usa o formato padrão abaixo. */
  template?: string | null;
}): string {
  const idTexto = params.cardUrl ? `<${params.cardUrl}|${params.codigo}>` : params.codigo;
  const marcacoes = params.mencoes.map((id) => `<@${id}>`).join(" ");

  if (params.template?.trim()) {
    return params.template
      .replaceAll("{{tarefa}}", idTexto)
      .replaceAll("{{responsavel}}", params.responsavel)
      .replaceAll("{{drive}}", params.driveUrl ?? "")
      .replaceAll("{{marcacoes}}", marcacoes);
  }

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
 * `channelOverride` é o canal da ETAPA (`BoardColumn.slackChannelId`), quando
 * ela definir um; vazio/ausente cai no canal global. O bot precisa já estar
 * no canal de destino, seja ele qual for — isso não muda pra um canal
 * alternativo, é a mesma exigência do canal padrão.
 *
 * Falha alta — quem chama decide se isso bloqueia algo ou só vira aviso em
 * Logs (ver o gatilho em `app/api/creator/cards/route.ts`, que trata a falta
 * de link de entrega e a falha de Slack como avisos, não erros que desfazem o
 * movimento do card).
 */
export async function enviarMensagemSlack(texto: string, channelOverride?: string | null): Promise<void> {
  const creds = await lerCredenciaisSlack();
  if (!creds) throw new Error("Slack não configurado (slackBotToken/slackChannelId) — ver Configurações › Sistema.");

  const res = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.botToken}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel: channelOverride || creds.channelId, text: texto }),
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

