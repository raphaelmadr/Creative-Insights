/**
 * Sincronização das entregas dos designers a partir do canal do Slack.
 *
 * A lógica vivia inteira dentro de `app/api/sync-slack/route.ts`, acessível só
 * pelo botão da página Equipe. Extraída para cá, o mesmo caminho serve tanto o
 * botão manual quanto a execução automática do cron — sem duas implementações
 * capazes de divergir.
 */

import prisma from "./prisma";

type SettingsRow = Awaited<ReturnType<typeof prisma.systemSettings.findUnique>>;

export interface SlackSyncResult {
  /** Entregas que não existiam no banco. */
  newDeliveries: number;
  /** Entregas já conhecidas que tiveram peças/autor/texto reescritos. */
  updatedDeliveries: number;
  /** Mensagens do canal que passaram pelo filtro de "N peças". */
  scannedMessages: number;
}

export interface SlackSyncOptions {
  /** Relê o mês inteiro em vez de continuar da última mensagem lida. */
  fullMonth?: boolean;
  month?: number;
  year?: number;
}

export function isSlackConfigured(settings: SettingsRow): boolean {
  return !!(settings?.slackBotToken && settings?.slackChannelId);
}

export async function runSlackSync(
  options: SlackSyncOptions = {},
  onProgress?: (message: string, percentage: number) => void
): Promise<SlackSyncResult> {
  const report = (message: string, percentage: number) => onProgress?.(message, percentage);

  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });

  if (!isSlackConfigured(settings)) {
    throw new Error("Credenciais do Slack não configuradas.");
  }

  const slackToken = settings!.slackBotToken!;
  const channelId = settings!.slackChannelId!;

  const fullMonth = options.fullMonth === true;
  const targetMonth = options.month || new Date().getMonth() + 1;
  const targetYear = options.year || new Date().getFullYear();

  // 1. Descobrir a última mensagem que lemos
  const lastDelivery = await prisma.delivery.findFirst({
    orderBy: { slackTs: "desc" },
  });

  let oldest: string | undefined;
  let latest: string | undefined;

  if (fullMonth) {
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 1);
    oldest = Math.floor(startDate.getTime() / 1000).toString();
    latest = Math.floor(endDate.getTime() / 1000).toString();
  } else if (lastDelivery) {
    oldest = lastDelivery.slackTs;
  }

  // 2. Buscar mensagens no Slack com paginação
  report("Lendo o histórico do canal...", 10);

  const allMessages: any[] = [];
  let nextCursor: string | undefined = undefined;

  do {
    let slackUrl = `https://slack.com/api/conversations.history?channel=${channelId}&limit=500`;
    if (oldest) slackUrl += `&oldest=${oldest}`;
    if (latest) slackUrl += `&latest=${latest}`;
    if (nextCursor) slackUrl += `&cursor=${nextCursor}`;

    const slackRes = await fetch(slackUrl, {
      headers: {
        Authorization: `Bearer ${slackToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const slackData = await slackRes.json();
    if (!slackData.ok) {
      throw new Error(`Erro na API do Slack: ${slackData.error}`);
    }

    if (slackData.messages) {
      allMessages.push(...slackData.messages);
    }

    nextCursor = slackData.response_metadata?.next_cursor;
  } while (nextCursor);

  // Filtra mensagens que não têm texto relevante ou bot messages sem contexto
  const validMessages = allMessages.filter(
    (m: any) => m.type === "message" && m.text && !m.subtype
  );

  console.log("Slack sync:", {
    fullMonth,
    targetMonth,
    targetYear,
    oldest,
    latest,
    allMessages: allMessages.length,
    validMessages: validMessages.length,
  });

  if (validMessages.length === 0) {
    report("Nenhuma mensagem nova.", 100);
    return { newDeliveries: 0, updatedDeliveries: 0, scannedMessages: 0 };
  }

  report(`${validMessages.length} mensagens para interpretar...`, 40);

  const creators = await prisma.creator.findMany();

  // Pré-compilar as Expressões Regulares para máxima performance
  const creatorRegexes: { creator: any; regex: RegExp }[] = [];
  for (const creator of creators) {
    const acronyms = creator.acronym
      .split(",")
      .map((a: string) => a.trim())
      .filter(Boolean);
    for (const ac of acronyms) {
      creatorRegexes.push({
        creator,
        regex: new RegExp(`(^|[^a-zA-Z0-9])(${ac})([^a-zA-Z0-9]|$)`, "i"),
      });
    }
  }

  // O balde sem atribuição é proposital: entrega de parceria/influenciador entra
  // aqui em vez de ser descartada.
  let unknownCreator = creators.find((c) => c.acronym.includes("UNKNOWN"));
  if (!unknownCreator) {
    unknownCreator = await prisma.creator.create({
      data: { name: "Parcerias, influenciadores ou sem atribuição", acronym: "UNKNOWN" },
    });
    creators.push(unknownCreator);
  }

  const opsToRun: { slackTs: string; creatorId: string; piecesCount: number; text: string }[] = [];

  for (const msg of validMessages) {
    const text = msg.text || "";

    // Procura a quantidade de peças (ex: "10peças", "1peça", "5 peças")
    const piecesMatch = text.match(/(\d+)\s*pe[cç]as?/i);
    if (!piecesMatch) continue;

    const piecesCount = Number(piecesMatch[1]);
    if (piecesCount <= 0) continue;

    let matchedCreator = null;
    for (const { creator, regex } of creatorRegexes) {
      if (regex.test(text)) {
        matchedCreator = creator;
        break;
      }
    }

    if (!matchedCreator) {
      matchedCreator = unknownCreator;
    }

    opsToRun.push({
      slackTs: msg.ts,
      creatorId: matchedCreator.id,
      piecesCount,
      text,
    });
  }

  // Processamento das operações no banco de dados em Lotes (Chunks)
  let newDeliveries = 0;
  let updatedDeliveries = 0;
  const CHUNK_SIZE = 20;

  for (let i = 0; i < opsToRun.length; i += CHUNK_SIZE) {
    const chunk = opsToRun.slice(i, i + CHUNK_SIZE);

    await Promise.all(
      chunk.map(async (op) => {
        try {
          const existing = await prisma.delivery.findUnique({ where: { slackTs: op.slackTs } });
          await prisma.delivery.upsert({
            where: { slackTs: op.slackTs },
            update: {
              creatorId: op.creatorId,
              pieces: op.piecesCount,
              text: op.text,
            },
            create: {
              slackTs: op.slackTs,
              creatorId: op.creatorId,
              pieces: op.piecesCount,
              date: new Date(parseFloat(op.slackTs) * 1000),
              text: op.text,
            },
          });

          if (existing) {
            updatedDeliveries++;
          } else {
            newDeliveries++;
          }
        } catch (e) {
          console.error("Error upserting delivery", e);
        }
      })
    );

    report(
      `Gravando entregas (${Math.min(i + CHUNK_SIZE, opsToRun.length)}/${opsToRun.length})...`,
      40 + Math.round((Math.min(i + CHUNK_SIZE, opsToRun.length) / opsToRun.length) * 60)
    );
  }

  return { newDeliveries, updatedDeliveries, scannedMessages: opsToRun.length };
}

/** Resumo curto para toast/log. */
export function summarizeSlackResult(result: SlackSyncResult): string {
  if (result.newDeliveries === 0 && result.updatedDeliveries === 0) {
    return "Slack: sem novas entregas";
  }
  return `Slack: ${result.newDeliveries} novas entregas / ${result.updatedDeliveries} atualizadas`;
}
