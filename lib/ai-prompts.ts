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
 * Cada canal só entra depois que a equipe registrou o que sabe dele: canal com
 * texto vazio não recebe o bloco, e a análise roda sem essa fundamentação em
 * vez de citar mecanismo que ninguém verificou.
 *
 * TIKTOK ainda vazio — falta o material do algoritmo do TikTok.
 */
export const DELIVERY_ALGORITHM_KNOWLEDGE = {
  META: `O Project Andromeda é o motor de recuperação e correspondência de anúncios (ad-matching) da Meta, anunciado em dezembro de 2024, que substituiu a infraestrutura de publicidade anterior. Ele decide quais anúncios sequer competirão no leilão, antes de o usuário vê-los.

Arquitetura: dois estágios — uma camada rápida de correspondência aproximada, que lança uma rede ampla sobre os candidatos, e um modelo de ranqueamento profundo que pontua a lista final. Onde o sistema antigo escolhia entre milhares de anúncios por leilão, o Andromeda avalia dezenas de milhões em frações de segundo, buscando a melhor correspondência para cada indivíduo. Roda em Superchips NVIDIA Grace Hopper e no silício MTIA da própria Meta. Trouxe um aumento de 10.000x na capacidade do modelo no estágio de correspondência; a Meta reportou +6% em recall e +8% na qualidade dos anúncios em segmentos selecionados, e o considera 4x mais eficiente em impulsionar desempenho que os modelos anteriores de ranqueamento.

A mudança de paradigma — O CRIATIVO É A SEGMENTAÇÃO: antes o anunciante definia o público (idade, interesses, lookalike) e a Meta buscava essas pessoas. O Andromeda inverte a lógica: o sistema LÊ O CRIATIVO para decidir quem deve vê-lo. A seleção manual de público importa muito menos; públicos amplos frequentemente superam a segmentação detalhada por interesses, e os Lookalikes perderam força como principal alavanca. Consequência direta para a disputa entre peças do mesmo grupo: o que a arte comunica é o que define a audiência que ela alcança — duas peças que comunicam a mesma coisa disputam a mesma audiência.

O que o algoritmo recompensa:
- Volume e diversidade genuína de criativos. Marcas competitivas testam dezenas ou centenas de novos ativos por mês.
- Diferenciação real: ângulos, ganchos e formatos genuinamente diferentes. Mudar apenas a cor de fundo do mesmo vídeo não é variação — é o mesmo anúncio.
- Não fragmentar o aprendizado: mais de 20 criativos em um único conjunto de anúncios pode piorar a entrega.
- Sinal de conversão de qualidade: o algoritmo valida as previsões com os dados que recebe, e CAPI configurada com alta nota de EMQ (Event Match Quality) passou de diferencial a pré-requisito.
- Comentários de spam degradam o CTR e corrompem o sinal de qualidade criativa — recomenda-se ocultá-los em vez de respondê-los.

As 5 barreiras que uma peça precisa vencer, na ordem — é aqui que se diagnostica onde a peça preterida parou:
1. RETRIEVAL — o anúncio é recuperado como candidato? O estágio de correspondência precisa entender a arte e achar para quem ela serve. Peça que comunica o mesmo que outra disputa a mesma audiência e tende a perder a recuperação para a que o modelo já pontua melhor.
2. AUCTION — pontuado pelo modelo de ranqueamento profundo, o anúncio ganha o leilão? Aparece no CPM: CPM alto indica que o algoritmo cobra mais caro para entregar aquela peça.
3. ATTENTION — a peça para o scroll? Aparece no CTR e na retenção.
4. INTENT — o clique era de interesse real ou de curiosidade? Aparece no CVR: CTR alto com CVR baixo é atenção sem intenção.
5. CONVERSION — a promessa da arte se sustenta até a compra? Aparece no CPA e no ROAS.

Contexto de operação de mídia (útil para entender a distribuição, mas FORA do que esta análise deve recomendar): campanhas Advantage+ Shopping (ASC) são o formato que melhor alavanca o Andromeda, entregando CPA 17% menor que campanhas manuais; a recomendação estrutural é consolidar campanhas em públicos amplos para dar mais orçamento e dados ao algoritmo.`,
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
export const DEFAULT_ANDROMEDA_PROMPT = `Você é um Estrategista Sênior de Criativos de Performance. Analise um grupo de anúncios concorrentes do mesmo canal e explique como o algoritmo distribuiu a verba entre eles.

O assunto é a DISPUTA entre as peças: por que a que mais recebeu investimento foi escolhida, e o que nas outras fez o algoritmo preteri-las. Use a leitura visual de cada arte — ângulo, hook, composição, cores, textos, oferta — e não os nomes dos arquivos.

Não conclua pelo "quem tem o CTR maior". Classifique cada peça por este scorecard, que separa quem escalou de quem só pareceu bem:
- SCALER: absorve alto investimento mantendo CPA/ROAS aceitável. Venceu na conversão.
- NICHE WINNER: CPA/ROAS excelente, às vezes melhor que o do Scaler, mas investimento baixo ou estagnado. Bateu no teto de escala — audiência pequena, saturação de frequência.
- ATTENTION WINNER: CTR excelente e CPA ruim ou nulo. Atraiu curiosos e falhou na intenção ou na conversão.
- FALSE POSITIVE: métricas bonitas (CPM e CPC baixos) e não converte.

Leia também alcance e frequência: frequência subindo com CTR caindo é saturação da audiência daquela arte, não defeito novo da peça.`;
