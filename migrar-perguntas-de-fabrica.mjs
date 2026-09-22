/**
 * Põe o quadro em dia com as perguntas de fábrica — uma vez só.
 *
 * O quadro real nasceu antes de `CAMPOS_DE_FABRICA` existir, e por isso tem as
 * três perguntas da nomenclatura como campos personalizados — dois deles com a
 * chave trocada por um reaproveitamento antigo:
 *
 *   `frente`               "Formato"  → a pergunta "Frente" foi RENOMEADA para
 *                                       "Formato" e ficou com a chave dela
 *   `frente_2`             "Frente"   → a "Frente" nova, criada ao lado
 *   `quantidade_de_pecas`  "Quantidade de Peças"
 *   `nome_do_influenciador` "Nome do influenciador/Embaixador"
 *
 * As respostas gravadas em `frente` são de DUAS perguntas diferentes: os cards
 * anteriores à renomeação responderam frentes ("Interno"), os posteriores
 * responderam formatos ("Feed e Stories"). Separá-las é a única parte que
 * nenhuma regra genérica resolve — e é a decisão que este arquivo registra:
 * frente é frente, formato é formato.
 *
 *   node migrar-perguntas-de-fabrica.mjs            confere e mostra o que faria
 *   node migrar-perguntas-de-fabrica.mjs --aplicar  grava
 *
 * Precisa do servidor de desenvolvimento PARADO: o banco é o mesmo, e as
 * conexões do `next dev` não deixam espaço para um script ao lado.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APLICAR = process.argv.includes("--aplicar");

/** As frentes que a nomenclatura conhece — `FRENTE_CODIGOS` em `lib/delivery-naming.ts`. */
const FRENTES = ["Interno", "Externo", "Influenciadores", "Embaixadores", "Unboxing"];

/** Chave velha → chave de fábrica. A resposta é a mesma; muda o lugar. */
const DE_PARA = {
  frente_2: "frente",
  quantidade_de_pecas: "quantidade",
  nome_do_influenciador: "parceiro",
};

/** O campo que foi reaproveitado: perde a chave `frente` e fica com a sua. */
const REAPROVEITADO = { de: "frente", para: "formato" };

const comoLista = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === "" ? [] : [v]);

/**
 * As respostas de um card, reorganizadas.
 *
 * Devolve `null` quando não há nada a fazer — é o que deixa o relatório mostrar
 * só os cards que mudam.
 */
function migrarRespostas(values) {
  const antes = { ...values };
  const novo = {};

  const daChaveVelha = comoLista(antes.frente);
  const frentes = [
    ...daChaveVelha.filter((v) => FRENTES.includes(v)),
    ...comoLista(antes.frente_2).filter((v) => FRENTES.includes(v)),
  ];
  const formatos = daChaveVelha.filter((v) => !FRENTES.includes(v));

  /*
   * A ordem das chaves é preservada: o JSON do card é lido por gente, e as
   * respostas saltando de lugar a cada migração atrapalham a conferência.
   */
  for (const [chave, valor] of Object.entries(antes)) {
    if (chave === "frente") {
      if (frentes.length) novo.frente = [...new Set(frentes)];
      if (formatos.length) novo.formato = formatos;
      continue;
    }
    if (chave === "frente_2") {
      // Já entrou acima, junto com as frentes da chave velha.
      if (!novo.frente && frentes.length) novo.frente = [...new Set(frentes)];
      continue;
    }
    if (chave in DE_PARA) {
      novo[DE_PARA[chave]] = valor;
      continue;
    }
    novo[chave] = valor;
  }

  return JSON.stringify(novo) === JSON.stringify(antes) ? null : novo;
}

async function main() {
  const campos = await prisma.boardField.findMany({ orderBy: [{ boardId: "asc" }, { position: "asc" }] });
  const cards = await prisma.boardCard.findMany({
    select: { id: true, code: true, title: true, values: true, boardId: true },
  });

  console.log(APLICAR ? "APLICANDO\n" : "CONFERINDO (nada é gravado)\n");

  /* ---- respostas ---- */
  const mudancas = [];
  for (const card of cards) {
    let values = {};
    try {
      values = JSON.parse(card.values || "{}");
    } catch {
      console.log(`#${card.code}: values ilegível, deixado como está`);
      continue;
    }
    const novo = migrarRespostas(values);
    if (novo) mudancas.push({ card, antes: values, novo });
  }

  for (const { card, antes, novo } of mudancas) {
    console.log(`#${card.code} ${card.title}`);
    console.log(`   antes: ${JSON.stringify(antes)}`);
    console.log(`   novo:  ${JSON.stringify(novo)}`);
  }
  console.log(`\n${mudancas.length} card(s) com resposta a mover.\n`);

  /* ---- campos ---- */
  const reaproveitado = campos.filter((f) => f.key === REAPROVEITADO.de);
  const duplicados = campos.filter((f) => f.key in DE_PARA);

  /*
   * O que de fato muda de nome NESTA execução — e é por isso que o mapa é
   * montado a partir do que existe, e não da lista fixa lá de cima.
   *
   * Depois de aplicada, nenhum campo tem mais a chave `frente` (ela é da
   * pergunta de fábrica, que não é linha de banco). Um mapa fixo continuaria
   * mandando mover `frente` → `formato`, e uma segunda execução levaria junto
   * a regra de envio do bruto, que aponta para a frente de propósito. Rodar de
   * novo tem de ser inofensivo.
   */
  const mapa = {
    ...Object.fromEntries(duplicados.map((f) => [f.key, DE_PARA[f.key]])),
    ...(reaproveitado.length ? { [REAPROVEITADO.de]: REAPROVEITADO.para } : {}),
  };

  if (!mudancas.length && !Object.keys(mapa).length) {
    console.log("Quadro já está em dia com as perguntas de fábrica — nada a fazer.");
    return;
  }

  for (const f of reaproveitado) {
    console.log(`campo "${f.label}": chave ${f.key} → ${REAPROVEITADO.para}`);
  }
  for (const f of duplicados) {
    console.log(`campo "${f.label}" (${f.key}): apagado — agora é pergunta de fábrica "${DE_PARA[f.key]}"`);
  }

  const apontam = campos.filter(
    (f) =>
      [f.dependsOn, f.showWhenKey, f.uploadWhenKey].some((k) => k && k in mapa) &&
      !(f.key in DE_PARA)
  );
  for (const f of apontam) {
    console.log(
      `campo "${f.label}": regra aponta para ${[f.dependsOn, f.showWhenKey, f.uploadWhenKey]
        .filter((k) => k && k in mapa)
        .join(", ")} — repontado`
    );
  }

  if (!APLICAR) {
    console.log("\nNada gravado. Rode com --aplicar para valer.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const { card, novo } of mudancas) {
      await tx.boardCard.update({ where: { id: card.id }, data: { values: JSON.stringify(novo) } });
    }

    for (const f of reaproveitado) {
      await tx.boardField.update({ where: { id: f.id }, data: { key: REAPROVEITADO.para } });
    }

    /*
     * As regras dos campos que ficam passam a apontar para a chave nova. Sem
     * isto, "Arquivos Brutos" continuaria esperando a resposta de `frente_2`,
     * que não existe mais, e o botão de envio nunca apareceria.
     *
     * UMA passada por campo, e não um `updateMany` por par de chaves: em
     * passadas sucessivas as duas renomeações se ENCADEIAM — `frente_2` vira
     * `frente`, e a passada seguinte, que move `frente` para `formato`, leva
     * junto a regra que acabou de chegar ali. Foi o que aconteceu na primeira
     * execução: a regra de envio do bruto foi parar no formato.
     */
    for (const f of campos) {
      const novo = {};
      for (const coluna of ["dependsOn", "showWhenKey", "uploadWhenKey"]) {
        const atual = f[coluna];
        if (atual && atual in mapa) novo[coluna] = mapa[atual];
      }
      if (Object.keys(novo).length) await tx.boardField.update({ where: { id: f.id }, data: novo });
    }

    await tx.boardField.deleteMany({ where: { id: { in: duplicados.map((f) => f.id) } } });
  }, { timeout: 30000 });

  console.log("\nFeito.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
