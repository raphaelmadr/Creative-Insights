import { NextResponse } from "next/server";
import { runSlackSync } from "@/lib/slack-sync";

export const maxDuration = 300;

/**
 * Sincronização manual das entregas — o botão da página Equipe.
 *
 * A lógica vive em `lib/slack-sync.ts`, compartilhada com o cron, para que a
 * execução manual e a automática nunca divirjam.
 */
export async function POST(req: Request) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch (e) {}

    const result = await runSlackSync({
      fullMonth: body.fullMonth === true,
      month: body.month,
      year: body.year,
    });

    if (result.newDeliveries === 0 && result.updatedDeliveries === 0) {
      return NextResponse.json({
        success: true,
        message: "Sem novas entregas sincronizadas.",
        newDeliveries: 0,
      });
    }

    return NextResponse.json({
      success: true,
      message: `${result.newDeliveries} novas entregas adicionadas.`,
      newDeliveries: result.newDeliveries,
      updatedDeliveries: result.updatedDeliveries,
    });
  } catch (error: any) {
    console.error("Error sync slack:", error);
    const notConfigured = /não configuradas/.test(error?.message || "");
    return NextResponse.json(
      { success: false, error: error.message },
      { status: notConfigured ? 400 : 500 }
    );
  }
}
