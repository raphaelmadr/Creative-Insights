/**
 * O catálogo da Allu para a caixa suspensa de produto.
 *
 * Passa pelo servidor e não é chamado direto do navegador porque o cache é do
 * servidor: com cada aba batendo no gateway por conta própria, não haveria
 * cache nenhum. De quebra, o erro da origem chega à tela já traduzido.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fetchAlluCatalog } from "@/lib/allu-catalog";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const force = new URL(request.url).searchParams.get("refresh") === "1";
    const products = await fetchAlluCatalog(force);

    return NextResponse.json({ success: true, products });
  } catch (error: any) {
    /*
     * 502 e não 500: quem falhou foi o gateway da Allu, não esta aplicação. A
     * tela usa a diferença para dizer "o catálogo não respondeu" em vez de
     * "erro no sistema", que mandaria a pessoa procurar no lugar errado.
     */
    return NextResponse.json(
      { error: error.message || "O catálogo da Allu não respondeu." },
      { status: 502 }
    );
  }
}
