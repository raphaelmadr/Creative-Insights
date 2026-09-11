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
