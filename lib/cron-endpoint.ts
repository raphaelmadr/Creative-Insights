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
 * cadastros no cPanel, não. Cada batida reivindica UMA das duas passadas — as
 * métricas primeiro, a mídia na batida seguinte — e assim um cron só, batendo
 * com frequência alta, alimenta as duas.
 */

import { NextResponse } from "next/server";
import prisma from "./prisma";
import { runSync } from "./channels";
import { describeMediaReport, runMetaMediaSync } from "./meta-media-sync";
import { logInfo, logWarning, logError } from "./logger";

const DEFAULT_INTERVAL_MINUTES = 120;

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
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // `?force=1` ignora o portão de intervalo, para testar o disparo na hora.
  const force = ["1", "true", "yes"].includes(
    (url.searchParams.get("force") || "").toLowerCase()
  );

  try {
    // A linha de configurações é criada sob demanda: numa instalação nova o
    // painel pode nunca ter sido salvo, e o cron não pode morrer por isso.
    const settings = await prisma.systemSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });

    if (!settings.cronSyncEnabled) {
      return NextResponse.json({
        success: true,
        status: "disabled",
        message: "Sincronização automática está desativada nas configurações.",
      });
    }

    const intervalMinutes = settings.cronSyncInterval || DEFAULT_INTERVAL_MINUTES;
    const startedAt = new Date();
    const cutoff = new Date(startedAt.getTime() - intervalMinutes * 60 * 1000);

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
     * Qual passada roda nesta batida.
     *
     * As métricas têm precedência: são o que alimenta os números do painel, e a
     * mídia pega a batida seguinte. Com o cron batendo a cada 15 min e o
     * intervalo em 30, cada passada roda uma vez por janela, alternando.
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
    } else if (await claim("lastCronSyncAt")) {
      job = "metrics";
    } else if (await claim("lastMediaSyncAt")) {
      job = "media";
    }

    if (!job) {
      const nextEligible = settings.lastCronSyncAt
        ? new Date(settings.lastCronSyncAt.getTime() + intervalMinutes * 60 * 1000)
        : null;
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
