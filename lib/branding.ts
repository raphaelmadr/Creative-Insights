/**
 * A marca do painel — nome e logotipo —, lida do banco com um padrão embutido.
 *
 * Existe porque nome e arte não são código: quem os troca é quem administra, e
 * antes disto trocar o título da aba exigia editar `app/layout.tsx` e publicar.
 *
 * Uma fonte só para o sistema inteiro. O cabeçalho, a tela de login, o
 * formulário público de demanda e o `<title>` leem daqui — se cada um tivesse o
 * seu caminho de imagem escrito à mão, como estava, trocar a marca seria caçar
 * ocorrências pelo repositório e esquecer uma.
 *
 * O padrão é o que já vinha no repositório, e é ele que vale numa instalação
 * que nunca configurou nada — nulo no banco significa "use o padrão", não
 * "apague a marca".
 */

import type { SystemSettings } from "@prisma/client";
import prisma from "./prisma";

export interface Marca {
  /** Vai no `<title>` e no texto alternativo do logotipo. */
  nome: string;
  /** Logotipo para o tema claro. */
  logo: string;
  /** Logotipo para o tema escuro — a troca é de CSS, ver `.logo-light`/`.logo-dark`. */
  logoEscuro: string;
}

export const MARCA_PADRAO: Marca = {
  nome: "Creative Insights",
  logo: "/logo.png",
  logoEscuro: "/logo-dark.png",
};

/** Monta a marca a partir de uma linha já lida — sem tocar no banco. */
export function marcaDaConfiguracao(
  settings: Pick<SystemSettings, "siteName" | "logoUrl" | "logoDarkUrl"> | null | undefined
): Marca {
  const nome = settings?.siteName?.trim() || MARCA_PADRAO.nome;
  const logo = settings?.logoUrl?.trim() || MARCA_PADRAO.logo;
  /*
   * Sem versão escura, vale a clara — e não o arquivo padrão. Quem subiu um
   * logotipo só quer ver o SEU logotipo nos dois temas; cair no do repositório
   * faria a marca alheia reaparecer no escuro.
   */
  const logoEscuro = settings?.logoDarkUrl?.trim() || logo;

  return { nome, logo, logoEscuro };
}

const TTL = 30_000;

/*
 * O cache vive no `globalThis`, e não numa variável de módulo.
 *
 * A rota que grava e a página que desenha são empacotadas separadamente pelo
 * Next: cada uma recebe a SUA instância deste módulo, e portanto a sua cópia da
 * variável. Com isso, `esquecerMarca()` limpava um cache que não era o do
 * render — trocar o nome no painel só aparecia quando os trinta segundos
 * venciam, que é precisamente a espera que a limpeza existe para eliminar.
 *
 * O processo é o mesmo para os dois lados, então o `globalThis` é o ponto de
 * encontro. Mesma razão do cliente do Prisma em `lib/prisma.ts`.
 */
declare global {
  var cacheDaMarca: { em: number; marca: Marca } | null | undefined;
}

/**
 * A marca para quem renderiza uma página.
 *
 * Guardada por trinta segundos pela mesma razão de `lib/auth-settings.ts`: é
 * lida em TODA página, o banco é o da hospedagem, e o que ela devolve é dado de
 * instalação — muda uma vez por ano. Quem grava limpa o cache na mesma ação,
 * então a troca aparece na hora para quem a fez.
 */
export async function lerMarca(): Promise<Marca> {
  const agora = Date.now();
  const cache = globalThis.cacheDaMarca;
  if (cache && agora - cache.em < TTL) return cache.marca;

  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { siteName: true, logoUrl: true, logoDarkUrl: true },
    });
    const marca = marcaDaConfiguracao(settings);
    globalThis.cacheDaMarca = { em: agora, marca };
    return marca;
  } catch {
    /* Banco fora não derruba a página: ela abre com a marca padrão. */
    return globalThis.cacheDaMarca?.marca ?? MARCA_PADRAO;
  }
}

/** Chamada por quem grava as configurações — a troca vale na hora. */
export function esquecerMarca(): void {
  globalThis.cacheDaMarca = null;
}
