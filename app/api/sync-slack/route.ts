import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
    
    if (!settings?.slackBotToken || !settings?.slackChannelId) {
      return NextResponse.json({ success: false, error: "Credenciais do Slack não configuradas." }, { status: 400 });
    }

    const slackToken = settings.slackBotToken;
    const channelId = settings.slackChannelId;

    let body: any = {};
    try { body = await req.json(); } catch(e) {}
    
    const fullMonth = body.fullMonth === true;
    const targetMonth = body.month || new Date().getMonth() + 1;
    const targetYear = body.year || new Date().getFullYear();

    // 1. Descobrir a última mensagem que lemos
    const lastDelivery = await prisma.delivery.findFirst({
      orderBy: { slackTs: 'desc' }
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
    let allMessages: any[] = [];
    let nextCursor: string | undefined = undefined;

    do {
      let slackUrl = `https://slack.com/api/conversations.history?channel=${channelId}&limit=500`;
      if (oldest) slackUrl += `&oldest=${oldest}`;
      if (latest) slackUrl += `&latest=${latest}`;
      if (nextCursor) slackUrl += `&cursor=${nextCursor}`;

      const slackRes = await fetch(slackUrl, {
        headers: {
          "Authorization": `Bearer ${slackToken}`,
          "Content-Type": "application/x-www-form-urlencoded"
        }
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
    const validMessages = allMessages.filter((m: any) => m.type === "message" && m.text && !m.subtype);

    console.log("Slack deep sync:", { fullMonth, targetMonth, targetYear, oldest, latest, allMessages: allMessages.length, validMessages: validMessages.length });

    if (validMessages.length === 0) {
      return NextResponse.json({ success: true, message: "Nenhuma nova mensagem de entrega encontrada.", newDeliveries: 0 });
    }

    const creators = await prisma.creator.findMany();
    // 3. Processamento Local (Regex)
    let savedCount = 0;

    // Pré-compilar as Expressões Regulares para máxima performance
    const creatorRegexes: { creator: any, regex: RegExp }[] = [];
    for (const creator of creators) {
      const acronyms = creator.acronym.split(',').map((a: string) => a.trim()).filter(Boolean);
      for (const ac of acronyms) {
        creatorRegexes.push({
          creator,
          regex: new RegExp(`(^|[^a-zA-Z0-9])(${ac})([^a-zA-Z0-9]|$)`, 'i')
        });
      }
    }

    let unknownCreator = creators.find(c => c.acronym.includes("UNKNOWN"));
    if (!unknownCreator) {
      unknownCreator = await prisma.creator.create({
        data: { name: "Parcerias, influenciadores ou sem atribuição", acronym: "UNKNOWN" }
      });
      creators.push(unknownCreator);
    }

    const opsToRun = [];

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
        text
      });
    }

    // Processamento das operações no banco de dados em Lotes (Chunks)
    const CHUNK_SIZE = 20;
    for (let i = 0; i < opsToRun.length; i += CHUNK_SIZE) {
      const chunk = opsToRun.slice(i, i + CHUNK_SIZE);
      
      await Promise.all(chunk.map(async (op) => {
        try {
          const existing = await prisma.delivery.findUnique({ where: { slackTs: op.slackTs } });
          await prisma.delivery.upsert({
            where: { slackTs: op.slackTs },
            update: {
              creatorId: op.creatorId,
              pieces: op.piecesCount,
              text: op.text
            },
            create: {
              slackTs: op.slackTs,
              creatorId: op.creatorId,
              pieces: op.piecesCount,
              date: new Date(parseFloat(op.slackTs) * 1000),
              text: op.text
            }
          });
          
          if (!existing) {
            savedCount++;
          }
        } catch (e) {
          console.error("Error upserting delivery", e);
        }
      }));
    }

    if (savedCount === 0) {
      return NextResponse.json({ success: true, message: "Sem novas entregas sincronizadas.", newDeliveries: 0 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `${savedCount} novas entregas adicionadas.`, 
      newDeliveries: savedCount 
    });

  } catch (error: any) {
    console.error("Error sync slack:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
