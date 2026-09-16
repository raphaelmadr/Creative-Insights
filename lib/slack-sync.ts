/**
 * Sincronização das entregas dos designers a partir do canal do Slack.
 *
 * A lógica vivia inteira dentro de `app/api/sync-slack/route.ts`, acessível só
 * pelo botão da página Equipe. Extraída para cá, o mesmo caminho serve tanto o
 * botão manual quanto a execução automática do cron — sem duas implementações
 * capazes de divergir.
 */

import prisma from "./prisma";
import { logExternalFailure } from "./external-log";
import {
  buildAliasIndex,
  resolveDesigner,
  splitAcronyms,
  UNATTRIBUTED_ACRONYM,
} from "./designer-match";

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

/**
 * O texto da mensagem sem os alvos de link, para o casamento de sigla.
 *
 * 86% das mensagens do canal trazem um link do Drive, e o Slack os escreve como
 * `<url|rótulo>`. O identificador do arquivo é aleatório, então mais cedo ou
 * mais tarde ele contém uma sigla de duas letras por acaso — foi o que
 * aconteceu com `1qGDhFCnqKzI-PP6_FLEh...`, que dava a peça de PT para PP.
 *
 * O rótulo é preservado porque é o nome do arquivo, e é ali que a convenção do
 * time põe a assinatura ("08_vídeo_pt_allu-ads-..."). Já menções (`<@U085...>`)
 * e links sem rótulo não têm texto humano nenhum e saem inteiros.
 */
export function slackTextForMatching(text: string): string {
  return text.replace(/<([^<>]*)>/g, (_full, inner: string) => {
    const separator = inner.indexOf("|");
    return separator >= 0 ? inner.slice(separator + 1) : " ";
  });
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

  /*
   * As entregas passam pela MESMA regra dos criativos (`lib/designer-match`).
   *
   * Aqui havia uma segunda implementação: montava um regex por sigla e ficava
   * com o primeiro que casasse, na ordem em que o banco devolvia os criadores.
   * Três consequências — "UNKNOWN" era casado como se fosse sigla de gente;
   * "INFLUENCIADORES" vencia a assinatura do designer no fim da mensagem, que é
   * a convenção do time; e o resultado mudava conforme a ordem do banco.
   */
  const aliases = buildAliasIndex(creators);

  const creatorByAcronym = new Map<string, (typeof creators)[number]>();
  for (const creator of creators) {
    for (const token of splitAcronyms(creator.acronym)) {
      if (!creatorByAcronym.has(token)) creatorByAcronym.set(token, creator);
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

    const canonical = resolveDesigner(slackTextForMatching(text), aliases);
    const matchedCreator =
      (canonical && canonical !== UNATTRIBUTED_ACRONYM
        ? creatorByAcronym.get(canonical)
        : null) ?? unknownCreator;

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
          await logExternalFailure({
            service: "Slack",
            operation: "gravar entrega lida do canal",
            error: e,
          });
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
