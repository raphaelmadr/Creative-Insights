/**
 * A sincronização automática: tudo que acontece quando o disparador externo
 * bate na porta.
 *
 * O disparador não decide nada — ele só acorda a aplicação. Quem decide se há
 * sincronização e com que frequência são duas configurações do painel:
 * `cronSyncEnabled` e `cronSyncInterval`. Por isso o cron do cPanel deve bater
 * com frequência alta (a cada 15 min) e é este módulo que filtra: mudar o
 * intervalo no painel passa a valer na hora, sem tocar no servidor.
 *
 * O que é sincronizado não é decidido aqui: é `runSync()`, o mesmo caminho do
 * botão manual.
 *
 * Um disparador só, duas passadas alternadas
 * ------------------------------------------
 * Métricas e mídia não cabem na mesma execução: uma requisição morre em 300s
 * (`maxDuration`) e só as fases de leitura da Meta consomem 180s. Antes da
 * separação, o resultado era 100 execuções iniciadas contra 2 concluídas, ambas
 * relatando "0 criativos" — a mídia rodava por último e nunca chegava a começar.
 *
 * Precisar de DUAS EXECUÇÕES é imposição da plataforma; precisar de dois
 * cadastros no cPanel, não. Cada batida reivindica UMA das duas passadas — a
 * que esperou mais — e assim um cron só, batendo com frequência alta, alimenta
 * as duas.
 *
 * Consequência que vale ter à vista: como as duas dividem o mesmo disparador, o
 * piso de cada passada é o dobro do passo do cron. Com o cron a cada 15 min,
 * escolher "15 minutos" no painel entrega 30 — não é o portão errando, é o que
 * cabe. Para o intervalo do painel valer ao pé da letra, o passo do cron tem
 * que ser no máximo a metade dele.
 */

import { NextResponse } from "next/server";
import prisma from "./prisma";
import { runSync } from "./channels";
import { describeMediaReport, runMetaMediaSync } from "./meta-media-sync";
import { logInfo, logWarning, logError } from "./logger";

const DEFAULT_INTERVAL_MINUTES = 120;

/**
 * Folga do portão de intervalo.
 *
 * O portão exigia que a passada anterior fosse *estritamente* mais velha que
 * `agora - intervalo`. Um disparador que bate no mesmo passo do intervalo chega
 * alguns segundos "cedo" — o relógio do cron não é o relógio do banco — e era
 * recusado por essa diferença, empurrando a passada para a batida seguinte. O
 * atraso não se dissolvia: virava o novo carimbo e adiava a batida seguinte de
 * novo. Um intervalo de 30 min entregava uma passada a cada 45.
 *
 * Um minuto de folga absorve essa variação e custa, no pior caso, um intervalo
 * de 29 min em vez de 30.
 */
const CLAIM_TOLERANCE_MS = 60 * 1000;

/**
 * O segredo aceito é o gerado pelo painel (`cronSecret`). Sem ele o endpoint
 * fica aberto — é o estado que o painel sinaliza como pendente.
 */
export async function acceptedSecrets(): Promise<string[]> {
  const secrets: string[] = [];

  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { cronSecret: true },
    });
    if (settings?.cronSecret) secrets.push(settings.cronSecret);
  } catch (error) {
    // Banco indisponível: sem segredo legível, a sincronização falharia adiante
    // de qualquer forma — o log registra a causa real.
    console.error("[Cron] Não foi possível ler o segredo do banco:", error);
  }

  return secrets;
}

/**
 * Um único autorizador para todos os endpoints de cron.
 *
 * Antes o cron de notícias validava por `process.env.CRON_SECRET` enquanto o de
 * sincronização passou a usar o segredo do painel — dois endpoints de cron
 * exigindo segredos diferentes, e o de notícias ficando aberto quando a
 * variável não existia.
 */
export async function isCronRequestAuthorized(req: Request): Promise<boolean> {
  const secrets = await acceptedSecrets();

  if (secrets.length === 0) {
    console.warn(
      "[Cron] Endpoint sem segredo configurado — qualquer um com a URL pode disparar. Gere um em Configurações › Sistema."
    );
    return true;
  }

  const url = new URL(req.url);
  const header = req.headers.get("authorization");
  const query = url.searchParams.get("secret") || url.searchParams.get("token");
  return secrets.some((s) => header === `Bearer ${s}` || query === s);
}

export async function handleCronRequest(req: Request) {
  const url = new URL(req.url);

  if (!(await isCronRequestAuthorized(req))) {
    /*
     * Registrar a recusa, e não só devolver 401.
     *
     * Era a única falha do caminho automático que não deixava rastro em
     * Configurações › Logs: o segredo trocado no painel, ou a URL antiga ainda
     * cadastrada no servidor, produziam exatamente a mesma tela de um cron que
     * nunca foi criado — nenhum log, nenhum carimbo, nada a investigar.
     */
    await logWarning(
      "CRON",
      "Batida recusada: segredo ausente ou incorreto. Confira o comando cadastrado no cPanel contra o segredo em Configurações › Sistema.",
      "/api/cron/sync-all"
    );
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // `?force=1` ignora o portão de intervalo, para testar o disparo na hora.
  const force = ["1", "true", "yes"].includes(
    (url.searchParams.get("force") || "").toLowerCase()
  );

  try {
    const startedAt = new Date();

    /*
     * A linha de configurações é criada sob demanda: numa instalação nova o
     * painel pode nunca ter sido salvo, e o cron não pode morrer por isso.
     *
     * O mesmo `upsert` carimba a batida. Antes daqui só existem a autorização e
     * a leitura da URL, então este carimbo significa exatamente "o disparador
     * chegou e foi aceito" — independente de rodar passada, de estar fora da
     * janela ou de a sincronização estar desligada no painel. É o único sinal
     * que prova que o cadastro no cPanel está de pé.
     */
    const settings = await prisma.systemSettings.upsert({
      where: { id: 1 },
      update: { lastCronPingAt: startedAt },
      create: { id: 1, lastCronPingAt: startedAt },
    });

    if (!settings.cronSyncEnabled) {
      return NextResponse.json({
        success: true,
        status: "disabled",
        message: "Sincronização automática está desativada nas configurações.",
      });
    }

    const intervalMinutes = settings.cronSyncInterval || DEFAULT_INTERVAL_MINUTES;
    const cutoff = new Date(
      startedAt.getTime() - intervalMinutes * 60 * 1000 + CLAIM_TOLERANCE_MS
    );

    /*
     * Reivindicação atômica da janela: a própria condição do UPDATE é o portão.
     * Duas batidas simultâneas — ou uma nova enquanto a anterior ainda roda —
     * não conseguem iniciar duas passadas concorrentes disputando a API da Meta
     * e as mesmas linhas do banco.
     */
    const claim = async (field: "lastCronSyncAt" | "lastMediaSyncAt") => {
      const result = await prisma.systemSettings.updateMany({
        where: { id: 1, OR: [{ [field]: null }, { [field]: { lt: cutoff } }] },
        data: { [field]: startedAt },
      });
      return result.count > 0;
    };

    /*
     * Qual passada roda nesta batida: a mais atrasada das duas.
     *
     * Dar precedência fixa às métricas parecia inofensivo porque a mídia pegava
     * "a batida seguinte" — mas isso só vale enquanto a janela das métricas
     * ainda está fechada nessa batida seguinte. Com a folga do portão, ou com o
     * intervalo igual ao passo do cron, as duas janelas abrem na mesma batida e
     * as métricas venciam sempre: a mídia nunca chegava a ser reivindicada.
     *
     * Comparar quem esperou mais faz a alternância cair sozinha, sem depender de
     * o intervalo ser o dobro do passo do cron. Nulo é o mais atrasado que
     * existe — passada que nunca rodou vai primeiro.
     *
     * `?job=` força uma das duas — é como se testa uma sozinha sem esperar a vez.
     */
    const requested = (url.searchParams.get("job") || "").toLowerCase();
    let job: "metrics" | "media" | null = null;

    if (requested === "media" || requested === "metrics") {
      // Pedido explícito ainda respeita a janela, a menos que venha com force.
      job = force || (await claim(requested === "media" ? "lastMediaSyncAt" : "lastCronSyncAt"))
        ? (requested as "metrics" | "media")
        : null;
      if (force) {
        await prisma.systemSettings.update({
          where: { id: 1 },
          data: requested === "media"
            ? { lastMediaSyncAt: startedAt }
            : { lastCronSyncAt: startedAt },
        });
      }
    } else if (force) {
      job = "metrics";
      await prisma.systemSettings.update({
        where: { id: 1 },
        data: { lastCronSyncAt: startedAt },
      });
    } else {
      const candidates: { job: "metrics" | "media"; field: "lastCronSyncAt" | "lastMediaSyncAt"; ranAt: Date | null }[] = [
        { job: "metrics", field: "lastCronSyncAt", ranAt: settings.lastCronSyncAt },
        { job: "media", field: "lastMediaSyncAt", ranAt: settings.lastMediaSyncAt },
      ];

      // Empate (as duas nulas) fica com as métricas, que é o que alimenta os
      // números do painel — a mídia entra na batida seguinte.
      candidates.sort((a, b) => (a.ranAt?.getTime() ?? 0) - (b.ranAt?.getTime() ?? 0));

      for (const candidate of candidates) {
        if (await claim(candidate.field)) {
          job = candidate.job;
          break;
        }
      }
    }

    if (!job) {
      // A próxima batida útil é a da passada que vence primeiro, não a das
      // métricas: quando é a mídia que está de vez, era o horário errado que
      // aparecia no painel.
      const dueAt = [settings.lastCronSyncAt, settings.lastMediaSyncAt]
        .filter((d): d is Date => d instanceof Date)
        .map((d) => d.getTime() + intervalMinutes * 60 * 1000);
      const nextEligible = dueAt.length > 0 ? new Date(Math.min(...dueAt)) : null;
      return NextResponse.json({
        success: true,
        status: "skipped",
        message: "Fora da janela de intervalo para ambas as passadas.",
        nextEligibleAt: nextEligible?.toISOString() ?? null,
      });
    }

    /*
     * A passada de mídia: criativos, artes em alta e renovação do link de vídeo.
     * Sai por aqui porque não divide execução com as métricas — é justamente o
     * ponto da alternância.
     */
    if (job === "media") {
      await logInfo("CRON", "Iniciando sincronização de mídia.", "/api/cron/sync-all");

      const media = await runMetaMediaSync((message, percentage) => {
        console.log(`[Cron mídia ${percentage}%] ${message}`);
      });

      const described = describeMediaReport(media);
      const summary = described.text;

      // Falha de gravação vira WARNING: um "Concluída" em nível INFO esconde
      // centenas de imagens que não subiram.
      if (described.ok) {
        await logInfo("CRON", `Concluída mídia. ${summary}`, "/api/cron/sync-all");
      } else {
        await logWarning("CRON", `Concluída mídia com falhas. ${summary}`, "/api/cron/sync-all");
      }

      return NextResponse.json({
        success: true,
        status: "ran",
        job: "media",
        message: summary,
        partial: media.reachedLimit,
        report: media,
        nextEligibleAt: new Date(startedAt.getTime() + intervalMinutes * 60 * 1000).toISOString(),
      });
    }

    // Log de início, não só de fim: quando a plataforma mata a função no meio
    // (timeout de execução), o log final nunca acontece e a execução fica
    // invisível. Um "Iniciando" sem "concluído" correspondente em
    // Configurações › Logs é a assinatura exata desse corte.
    await logInfo("CRON", "Iniciando sincronização automática.", "/api/cron/sync-all");

    const report = await runSync((message, percentage) => {
      console.log(`[Cron ${percentage}%] ${message}`);
    });

    // Falta de credencial não é erro de execução: fica registrado como aviso e
    // responde 200, para o disparador do cPanel não passar a enviar e-mail de
    // falha a cada batida por causa de uma configuração incompleta.
    if (report.nothingConfigured) {
      await logWarning("CRON", report.summary, "/api/cron/sync-all");
    } else if (report.ok) {
      await logInfo("CRON", `Concluída. ${report.summary}`, "/api/cron/sync-all");
    } else {
      await logWarning("CRON", `Concluída com falhas. ${report.summary}`, "/api/cron/sync-all");
    }

    return NextResponse.json(
      {
        success: report.ok,
        status: report.nothingConfigured ? "nothing-configured" : "ran",
        job: "metrics",
        message: report.summary,
        partial: report.partial,
        outcomes: report.outcomes,
        nextEligibleAt: new Date(startedAt.getTime() + intervalMinutes * 60 * 1000).toISOString(),
      },
      { status: report.ok ? 200 : 500 }
    );
  } catch (error: any) {
    console.error("[Cron] Erro ao executar a sincronização:", error);
    await logError("CRON", error, "/api/cron/sync-all");
    return NextResponse.json(
      { success: false, status: "error", error: error?.message || "Erro desconhecido" },
      { status: 500 }
    );
  }
}
