/**
 * A referência de quebra de UMA etapa em UM canal — gravada de dentro do funil.
 *
 * Existe em vez de um POST em `/api/settings` por dois motivos. O primeiro é a
 * fusão: as referências moram dentro do JSON de `creativeCategories`, e mandar
 * a lista inteira do navegador faria a última aba aberta sobrescrever o que as
 * outras gravaram enquanto ela estava parada. Aqui o servidor lê, troca uma
 * chave e devolve — o que ninguém tocou fica como estava.
 *
 * O segundo é o alcance: `/api/settings` grava credenciais, e quem mexe no
 * funil não precisa desse portão inteiro. Este aqui só encosta em um número de
 * leitura, mas continua sendo de admin: o alvo vale para todo mundo que abre o
 * painel, não é preferência de quem está olhando.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth";
import { loadCategories } from "@/lib/creative-categories";

export const dynamic = "force-dynamic";

const CANAIS = new Set(["META", "TIKTOK", "GOOGLE"]);

export async function POST(request: Request) {
  try {
    if (!(await getCurrentAdmin())) {
      return NextResponse.json(
        { success: false, error: "Só um administrador pode mudar a referência." },
        { status: 403 }
      );
    }

    const { categoryId, channel, value, funnel } = await request.json();
    /* Cada funil guarda os próprios alvos: o geral em `refs`, o de novos em `refsNovos`. */
    const campo = funnel === "novos" ? "refsNovos" : "refs";
    const canal = String(channel || "").toUpperCase();

    if (!categoryId || !CANAIS.has(canal)) {
      return NextResponse.json({ success: false, error: "Etapa ou canal inválido." }, { status: 400 });
    }

    /*
     * Vazio APAGA a referência, e não grava zero: zero é um alvo legítimo
     * ("esta etapa não deveria receber nada"), e é a ausência que manda o funil
     * voltar a comparar com o mês anterior. Fundir os dois tiraria da tela a
     * única forma de desfazer.
     */
    let numero: number | null = null;
    if (value !== null && value !== undefined && value !== "") {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { success: false, error: "A referência precisa ser um número positivo." },
          { status: 400 }
        );
      }
      numero = Math.round(n * 10) / 10;
    }

    const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
    const categorias = loadCategories(settings);
    const alvo = categorias.find((c) => c.id === categoryId);

    if (!alvo) {
      return NextResponse.json(
        { success: false, error: "Esta etapa não existe mais nas categorias." },
        { status: 404 }
      );
    }

    const refs = { ...(alvo[campo] || {}) };
    if (numero === null) delete refs[canal];
    else refs[canal] = numero;
    alvo[campo] = Object.keys(refs).length ? refs : undefined;

    const json = JSON.stringify(categorias);
    await prisma.systemSettings.upsert({
      where: { id: 1 },
      update: { creativeCategories: json },
      create: { id: 1, creativeCategories: json },
    });

    return NextResponse.json({ success: true, categoryId, channel: canal, value: numero });
  } catch (error) {
    console.error("Erro ao gravar a referência do funil:", error);
    return NextResponse.json({ success: false, error: "Não foi possível gravar." }, { status: 500 });
  }
}
