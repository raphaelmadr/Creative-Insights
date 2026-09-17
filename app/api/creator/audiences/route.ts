/**
 * Os públicos personalizados do Meta para a caixa suspensa de público.
 *
 * Precisa ser servidor: a consulta usa o token do Meta, que nunca sai de
 * `SystemSettings` para o navegador — é a mesma regra de
 * `lib/settings-visibility.ts`, que existe porque a rota de configurações já
 * devolveu credencial para quem não devia.
 */

import { NextResponse } from "next/server";
import { friendlyFailureMessage } from "@/lib/external-log";
import { getCurrentCreator } from "@/lib/auth";
import { CREATOR_ONLY_ERROR } from "@/lib/roles";
import { fetchMetaAudiences, audienceSubtypeLabel } from "@/lib/meta-audiences";

export async function GET(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const force = new URL(request.url).searchParams.get("refresh") === "1";
    const audiences = await fetchMetaAudiences(force);

    /*
     * O rótulo do subtipo é traduzido aqui, e não na tela.
     *
     * `lib/meta-audiences.ts` lê o token do Meta, então é servidor por
     * definição e a tela não pode importá-lo — é a mesma regra que separa
     * `lib/acronyms.ts` de `lib/designer-match.ts`. Duplicar o dicionário no
     * cliente faria a lista dizer "MULTI_DATA" enquanto o prompt diz "Site".
     */
    return NextResponse.json({
      success: true,
      audiences: audiences.map((a) => ({
        ...a,
        subtypeLabel: audienceSubtypeLabel(a.subtype),
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: friendlyFailureMessage([{ service: "Meta Ads", error }]) },
      { status: 502 }
    );
  }
}
