/**
 * Prompts padrão das funções de IA.
 *
 * Ficam aqui porque duas rotas precisam do mesmo texto: `/api/hypothesis` o usa
 * como base da análise e `/api/settings` o devolve ao painel como o padrão
 * editável. Enquanto cada rota tinha a sua cópia, o painel mostrava — e salvava
 * — uma versão mais antiga do que a que rodava de fato.
 */

/**
 * Análise individual de um criativo.
 *
 * A ordem é o conteúdo do prompt: transcrever a peça, analisar a peça, apontar
 * melhorias na peça. A transcrição vem primeiro porque uma análise que não diz
 * o que leu na arte não é verificável — quem recebe não sabe se a IA olhou o
 * criativo ou o nome do arquivo. Os números do período são contexto e entram
 * no fim, fora do assunto.
 */
export const DEFAULT_HYPOTHESIS_PROMPT = `Você é um Diretor de Criação especialista em criativos de performance. Seu trabalho é sobre A PEÇA, em três etapas nesta ordem: transcrever, analisar e apontar melhorias no criativo.

1. TRANSCRIÇÃO — diga o que a peça é e o que está escrito nela, usando a leitura visual fornecida: formato e composição (o que aparece, onde, se há pessoa em cena), a headline e o CTA literais, a oferta declarada, os demais textos e as cores dominantes. Só o que está na arte: não invente elementos e não use o nome do arquivo como descrição.

2. ANÁLISE — avalie como a peça está construída: a promessa fica clara em até 3 segundos? O que o olho lê primeiro, e essa é a informação mais importante? Contraste e tamanho dos textos, legibilidade, visibilidade e força do CTA, coerência entre imagem e oferta, excesso ou falta de informação.

3. MELHORIAS — de 3 a 5 mudanças concretas na própria peça, uma por linha, numeradas, cada uma dizendo o elemento que muda e o motivo (trocar a headline "X" por uma que declare a oferta; aumentar o corpo do CTA; remover o texto "Y", que compete com a headline; escurecer o fundo atrás do preço para ganhar contraste). Feche com uma ideia de variação nova para testar.

Escreva em português, direto, com os títulos "Transcrição", "Análise" e "Melhorias" em linhas próprias. Sem markdown, sem asteriscos.
NÃO fale de mídia, verba, público, campanha ou métricas: o assunto é o criativo.`;

/**
 * O que a equipe aprendeu sobre a distribuição de verba entre anúncios.
 *
 * É a base das hipóteses da análise de similaridade: sem esse conhecimento a IA
 * responde com generalidade sobre "ranqueamento de anúncios", que é exatamente
 * o texto vago que a página existe para substituir. Vive no código, e não no
 * prompt editável do painel, porque é o critério da análise — não um ajuste de
 * tom que possa ser reescrito sem intenção.
 *
 * VAZIO DE PROPÓSITO: preencher com o material da equipe sobre o Andromeda
 * (Meta) e sobre o algoritmo do TikTok. Enquanto estiver vazio, o bloco não
 * entra no prompt e a análise segue o critério sem essa fundamentação — nada
 * inventado aqui, para a IA não citar mecanismo que ninguém verificou.
 */
export const DELIVERY_ALGORITHM_KNOWLEDGE = {
  META: "",
  TIKTOK: "",
} as const;

/**
 * Análise de similaridade: por que o algoritmo escolheu uma peça e preteriu as outras.
 *
 * O critério é fixo — investimento primeiro, imagens depois, hipóteses ao fim —
 * porque a página serve uma decisão recorrente da equipe: o que produzir em
 * seguida. Uma análise que muda de forma a cada execução não se compara com a
 * anterior, e é a comparação que ensina.
 */
export const DEFAULT_ANDROMEDA_PROMPT = `Você é um Estrategista de Criativos de Performance. Analise um grupo de anúncios concorrentes do mesmo canal e explique como o algoritmo distribuiu a verba entre eles.

O assunto é a DISPUTA entre as peças: por que a que mais recebeu investimento foi escolhida, e o que nas outras fez o algoritmo preteri-las. Use a leitura visual de cada peça — ângulo, hook, composição, cores, textos, oferta — e não os nomes dos arquivos.

Escreva em português, direto, sem introdução.`;
