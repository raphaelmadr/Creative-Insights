/**
 * Leitura do campo `acronym` de um criador.
 *
 * Mora fora de `designer-match` porque aquele módulo importa o Prisma, e a tela
 * de configurações — um componente de cliente — precisa da mesma regra para
 * desenhar os selos de sigla. Sem esta separação, o Prisma iria parar no pacote
 * do navegador.
 */

/**
 * Separa o campo `acronym` nas siglas que ele declara.
 *
 * A tela pede "separadas por vírgula", mas quem digita espaço, barra ou
 * ponto-e-vírgula não recebe erro nenhum: a sigla simplesmente deixava de
 * existir para o casamento, e todo o trabalho da pessoa caía no balde sem que
 * ninguém percebesse. Aceitar os separadores plausíveis é o que garante que
 * TODAS as siglas cadastradas entrem na regra.
 *
 * Hífen e ponto ficam de fora de propósito — podem fazer parte da sigla, e a
 * fronteira de `aliasPattern` já sabe lidar com eles.
 */
export function splitAcronyms(raw: string | null | undefined): string[] {
  return (raw || "")
    .split(/[,;/|\s]+/)
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * A sigla que identifica o criador em um lugar só.
 *
 * O campo `acronym` é uma lista de apelidos ("RM, RAPHAELMADUREIRA"), e todos
 * eles casam com o nome de um anúncio. Mas quando é preciso **gravar** quem é a
 * pessoa — o responsável por um card, por exemplo —, tem de haver um valor só, e
 * é o primeiro: é a mesma canônica que `buildAliasIndex` faz os outros apelidos
 * apontarem.
 *
 * Com a lista inteira no lugar da canônica, o `<select>` de responsável gravava
 * "RM, RAPHAELMADUREIRA", recebia de volta o texto normalizado pela rota e não
 * encontrava mais a própria opção — a escolha parecia não pegar.
 */
export function primaryAcronym(raw: string | null | undefined): string {
  return splitAcronyms(raw)[0] ?? "";
}

/** O balde de quem não tem dono. Não é uma pessoa; não se atribui nada a ele. */
export const UNATTRIBUTED_ACRONYM = "UNKNOWN";
