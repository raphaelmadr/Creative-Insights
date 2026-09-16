/**
 * Backfill dos criativos já gravados.
 *
 * Reprocessa dois campos que ficaram inconsistentes por bugs de gravação:
 *
 *  1. `designer` — passa a usar a regra única de `lib/designer-match`, que
 *     grava sempre a sigla CANÔNICA do criador. Antes era gravado o apelido que
 *     casou (daí 197 registros com "INFLUENCIADORES" em vez da sigla canônica),
 *     e "UNKNOWN" vazava para a lista de siglas válidas.
 *
 *  2. `status` — normaliza o vocabulário do TikTok (ENABLE/DISABLE) para o
 *     vocabulário único ACTIVE/PAUSED usado pela interface.
 *
 * `createdTime` corrompido (registros com a data de um sync) não é tratado aqui:
 * o valor verdadeiro só existe na API e é restaurado pela própria sincronização,
 * que agora nunca sobrescreve o campo com "agora".
 *
 * Uso:  npx tsx backfill-creatives.ts [--apply]
 * Sem --apply, roda em modo simulação e apenas relata o que mudaria.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import prisma from "./lib/prisma";
import { loadAliasIndex, resolveDesigner } from "./lib/designer-match";
import { normalizeTikTokStatus, normalizeMetaStatus } from "./lib/ad-status";

const APPLY = process.argv.includes("--apply");

async function main() {
  const aliases = await loadAliasIndex();
  console.log(`Siglas reconhecidas (${aliases.length}):`);
  console.log(
    aliases.map((a) => (a.alias === a.canonical ? a.alias : `${a.alias}→${a.canonical}`)).join(", ")
  );
  console.log(APPLY ? "\nMODO: aplicando alterações\n" : "\nMODO: simulação (use --apply para gravar)\n");

  const creatives = await prisma.adCreative.findMany({
    select: { id: true, adName: true, designer: true, status: true, platform: true },
  });

  let designerChanges = 0;
  let designerCleared = 0;
  let statusChanges = 0;
  const designerSamples: string[] = [];
  const statusSamples: string[] = [];

  for (const creative of creatives) {
    const update: { designer?: string | null; status?: string } = {};

    const resolvedDesigner = resolveDesigner(creative.adName, aliases);
    if (resolvedDesigner !== creative.designer) {
      // Só limpamos um designer existente quando ele não corresponde a nenhuma
      // sigla cadastrada — pode ser resquício da regra antiga.
      if (resolvedDesigner === null && creative.designer !== null) {
        const stillValid = aliases.some((a) => a.canonical === creative.designer);
        if (stillValid) {
          // Nome não bate mais com a sigla, mas a sigla existe: preserva a
          // atribuição manual em vez de destruir informação.
        } else {
          update.designer = null;
          designerCleared++;
        }
      } else if (resolvedDesigner !== null) {
        update.designer = resolvedDesigner;
        designerChanges++;
        if (designerSamples.length < 15) {
          designerSamples.push(`${creative.designer ?? "(vazio)"} → ${resolvedDesigner}  |  ${creative.adName}`);
        }
      }
    }

    const normalizedStatus =
      creative.platform === "TIKTOK"
        ? normalizeTikTokStatus(creative.status)
        : normalizeMetaStatus(creative.status);

    if (creative.status && normalizedStatus !== "UNKNOWN" && normalizedStatus !== creative.status) {
      update.status = normalizedStatus;
      statusChanges++;
      if (statusSamples.length < 10) {
        statusSamples.push(`${creative.platform}: ${creative.status} → ${normalizedStatus}`);
      }
    }

    if (APPLY && Object.keys(update).length > 0) {
      await prisma.adCreative.update({ where: { id: creative.id }, data: update });
    }
  }

  console.log(`Criativos analisados: ${creatives.length}`);
  console.log(`\nDesigner reatribuído: ${designerChanges}`);
  designerSamples.forEach((sample) => console.log(`  ${sample}`));
  console.log(`Designer removido (sigla inexistente): ${designerCleared}`);
  console.log(`\nStatus normalizado: ${statusChanges}`);
  statusSamples.forEach((sample) => console.log(`  ${sample}`));

  if (!APPLY) console.log("\nNada foi gravado. Rode com --apply para efetivar.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
