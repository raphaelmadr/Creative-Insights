/**
 * A leitura de `/api/settings` compartilhada entre as telas de configuração.
 *
 * Quatro das seis telas do painel pedem a MESMA linha de configuração —
 * Equipe, Metas, Sistema e IA —, e cada uma pedia do zero ao montar. Trocar de
 * aba era esperar de novo por algo que já estava na memória do navegador:
 * meio segundo por clique, medido daqui, quase todo ele de ida e volta ao
 * banco da hospedagem.
 *
 * Quinze segundos de validade, e não mais: o painel é a tela onde a pessoa
 * está justamente para MEXER na configuração, e ver um valor velho ali é pior
 * do que em qualquer outro lugar. Na prática isso cobre a navegação entre as
 * abas — que é o que acontece em segundos — e não cobre a volta depois de um
 * café, que é quando reler é o certo.
 *
 * Quem grava chama `esquecerConfiguracoes()`: depois de salvar, a próxima aba
 * tem de mostrar o que foi salvo, não o que estava antes.
 */

export type RespostaDeConfiguracoes = {
  success: boolean;
  error?: string;
  /* A resposta é um mapa amplo — a linha inteira de `SystemSettings`, mais o
     estado das integrações e do armazenamento —, e cada tela lê os campos que
     lhe interessam. Tipá-la campo a campo aqui seria manter uma segunda cópia
     do modelo do Prisma, que divergiria dele na primeira coluna nova. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [chave: string]: any;
};

const TTL = 15_000;

let cache: { em: number; resposta: RespostaDeConfiguracoes } | null = null;
/** A requisição em curso, para que duas telas montando juntas façam UMA ida. */
let emVoo: Promise<RespostaDeConfiguracoes> | null = null;

export async function lerConfiguracoes(): Promise<RespostaDeConfiguracoes> {
  if (cache && Date.now() - cache.em < TTL) return cache.resposta;
  if (emVoo) return emVoo;

  emVoo = fetch("/api/settings")
    .then((r) => r.json())
    .then((resposta: RespostaDeConfiguracoes) => {
      // Só o que deu certo é guardado: uma falha guardada seria repetida por
      // quinze segundos em todas as abas, e a tela seguinte abriria vazia sem
      // nem tentar.
      if (resposta?.success) cache = { em: Date.now(), resposta };
      return resposta;
    })
    .finally(() => {
      emVoo = null;
    });

  return emVoo;
}

/** Esquece o que foi lido — chamada depois de gravar. */
export function esquecerConfiguracoes(): void {
  cache = null;
}
