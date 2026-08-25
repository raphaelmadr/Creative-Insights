import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const maxDuration = 300;

const prisma = new PrismaClient();

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

    if (validMessages.length === 0) {
      return NextResponse.json({ success: true, message: "Nenhuma nova mensagem de entrega encontrada.", newDeliveries: 0 });
    }

    const creators = await prisma.creator.findMany();
    // 3. Processamento Local (Regex)
    let savedCount = 0;

    for (const msg of validMessages) {
      const text = msg.text || "";
      
      // Procura a quantidade de peças (ex: "10peças", "1peça", "5 peças")
      const piecesMatch = text.match(/(\d+)\s*pe[cç]as?/i);
      if (!piecesMatch) continue;
      
      const piecesCount = Number(piecesMatch[1]);
      if (piecesCount <= 0) continue;

      // Identifica o autor baseado na lista de siglas cadastradas (até 3, separadas por vírgula)
      let matchedCreator = null;

      for (const creator of creators) {
        const acronyms = creator.acronym.split(',').map(a => a.trim()).filter(Boolean);
        
        for (const ac of acronyms) {
          // Busca a sigla isolada por qualquer caractere que não seja letra/número (ex: _pt_, "ez", -RM-)
          const regex = new RegExp(`(^|[^a-zA-Z0-9])(${ac})([^a-zA-Z0-9]|$)`, 'i');
          if (regex.test(text)) {
            matchedCreator = creator;
            break;
          }
        }
        if (matchedCreator) break;
      }

      // Se não encontrou nenhuma sigla conhecida, atribui para "Time Interno"
      if (!matchedCreator) {
        matchedCreator = creators.find(c => c.acronym.includes("UNKNOWN"));
        
        if (!matchedCreator) {
          matchedCreator = await prisma.creator.create({
            data: { name: "Parcerias, influenciadores ou sem atribuição", acronym: "UNKNOWN" }
          });
          creators.push(matchedCreator);
        }
      }

      // Salva no banco
      if (matchedCreator) {
        try {
          const existing = await prisma.delivery.findUnique({ where: { slackTs: msg.ts } });
          await prisma.delivery.upsert({
            where: { slackTs: msg.ts },
            update: {
              creatorId: matchedCreator.id,
              pieces: piecesCount,
              text: text
            },
            create: {
              slackTs: msg.ts,
              creatorId: matchedCreator.id,
              pieces: piecesCount,
              date: new Date(parseFloat(msg.ts) * 1000),
              text: text
            }
          });
          
          if (!existing) {
            savedCount++;
          }
        } catch (e) {
          console.error("Error upserting delivery", e);
        }
      }
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
