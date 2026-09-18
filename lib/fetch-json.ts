/**
 * `fetch` que entende quando a resposta não veio da aplicação.
 *
 * Todas as telas faziam `await res.json()` direto. Isso funciona enquanto quem
 * responde é a rota — que sempre devolve JSON, inclusive nos erros. Mas entre o
 * navegador e a rota existem duas camadas que respondem por conta própria, em
 * HTML: a CDN e o servidor da hospedagem. Quando o servidor passa a recusar por
 * excesso de requisições, ele devolve a própria página de 403, e o `res.json()`
 * estoura com **"Unexpected token '<', "<!DOCTYPE "... is not valid JSON"** —
 * uma mensagem que aponta para o lugar errado. Quem lê procura o defeito no
 * código que acabou de subir, quando o que houve foi um bloqueio de rede.
 *
 * Aqui o corpo é lido como texto e só então convertido. Se não for JSON, a
 * mensagem diz de onde veio e o que fazer — e o status, que é o que distingue
 * um bloqueio de uma queda.
 */

export class RespostaNaoJson extends Error {
  readonly status: number;
  /** O começo do corpo recebido, para o console de quem for investigar. */
  readonly amostra: string;

  constructor(status: number, corpo: string) {
    super(mensagemPara(status));
    this.name = "RespostaNaoJson";
    this.status = status;
    this.amostra = corpo.slice(0, 200);
  }
}

function mensagemPara(status: number): string {
  if (status === 403) {
    return "O servidor da hospedagem recusou a requisição (403) antes de ela chegar à aplicação — normalmente é bloqueio por excesso de requisições vindas do mesmo endereço. Espere alguns minutos e recarregue a página.";
  }
  if (status === 429) {
    return "Requisições demais em pouco tempo (429). Espere alguns minutos e recarregue a página.";
  }
  if (status >= 500) {
    return `A hospedagem respondeu com uma página de erro (${status}) em vez da aplicação. Se persistir, é o servidor, não a tela.`;
  }
  return `A resposta não veio da aplicação (status ${status}). Provavelmente uma camada entre o navegador e o servidor respondeu no lugar dela.`;
}

export interface RespostaJson<T> {
  ok: boolean;
  status: number;
  /** `null` quando a resposta não tem corpo — 204, por exemplo. */
  data: T;
}

/**
 * Faz a requisição e devolve o corpo já convertido.
 *
 * Não lança em resposta de erro da aplicação: um 400 com `{ error }` é
 * informação, e cada tela decide como mostrá-la. Lança apenas quando o corpo
 * não é JSON — porque aí não há o que a tela possa dizer sobre ele.
 */
export async function fetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<RespostaJson<T>> {
  const res = await fetch(input, init);
  const corpo = await res.text();

  if (!corpo.trim()) {
    return { ok: res.ok, status: res.status, data: null as T };
  }

  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(corpo) as T };
  } catch {
    throw new RespostaNaoJson(res.status, corpo);
  }
}
