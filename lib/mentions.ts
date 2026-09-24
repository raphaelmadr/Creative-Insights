/**
 * Quem foi mencionado em um texto — a regra, em um lugar só.
 *
 * Uma menção é uma arroba colada ao NOME de alguém do time: `@Ana Paula`. O
 * nome é o que a pessoa vê e digita; o e-mail é o que o sistema usa. A ponte
 * entre os dois é esta função, e ela é chamada nos dois lados: o servidor
 * resolve para saber quem avisar, e a tela resolve para pintar o trecho.
 *
 * O texto é a verdade, e não uma lista que o navegador mande junto. Quem
 * escolheu "Ana Paula" na lista e depois apagou o nome da frase não mencionou
 * ninguém — e um aviso disparado por uma lista paralela contrariaria o que está
 * escrito no comentário, que é o que todo mundo lê depois.
 *
 * O nome mais longo vence: com "Ana" e "Ana Paula" no time, `@Ana Paula` é uma
 * menção a Ana Paula, e não duas. Por isso a varredura anda pelo texto
 * marcando o que já consumiu, em vez de procurar cada pessoa por sua conta.
 */

export interface PessoaMencionavel {
  email: string;
  name: string;
}

/** Um pedaço de texto para desenhar: ou texto puro, ou uma menção reconhecida. */
export interface ParteDoTexto {
  texto: string;
  /** O e-mail de quem foi mencionado, ou `null` quando é texto comum. */
  mencao: string | null;
}

/*
 * O que pode encostar em uma menção sem quebrá-la.
 *
 * `@Ana,` e `@Ana.` são menções; `@Anabela` não é — senão quem se chama "Ana"
 * receberia aviso de toda palavra que comece por "ana" depois de uma arroba.
 * A verificação é sobre o caractere SEGUINTE ao nome: se for letra ou número, o
 * nome continua e portanto não era ele.
 */
const CONTINUA_A_PALAVRA = /[\p{L}\p{N}]/u;

/**
 * Quebra o texto em pedaços, marcando as menções encontradas.
 *
 * É a operação base: `mencoesNoTexto` é ela descartando o texto comum. Uma
 * função só para as duas garante que a tela pinte exatamente o que o servidor
 * avisou — se divergissem, um comentário mostraria um nome destacado que não
 * notificou ninguém.
 */
export function separarMencoes(texto: string, pessoas: PessoaMencionavel[]): ParteDoTexto[] {
  if (!texto) return [];

  /* Do nome mais longo para o mais curto — ver o cabeçalho. */
  const candidatos = pessoas
    .filter((p) => p.name?.trim() && p.email?.trim())
    .map((p) => ({ email: p.email.trim().toLowerCase(), nome: p.name.trim() }))
    .sort((a, b) => b.nome.length - a.nome.length);

  const partes: ParteDoTexto[] = [];
  let comum = "";
  let i = 0;

  const guardaComum = () => {
    if (comum) {
      partes.push({ texto: comum, mencao: null });
      comum = "";
    }
  };

  while (i < texto.length) {
    if (texto[i] !== "@") {
      comum += texto[i];
      i += 1;
      continue;
    }

    const depoisDaArroba = texto.slice(i + 1);
    const achado = candidatos.find((c) => {
      if (depoisDaArroba.slice(0, c.nome.length).toLowerCase() !== c.nome.toLowerCase()) return false;
      const seguinte = depoisDaArroba[c.nome.length];
      return !seguinte || !CONTINUA_A_PALAVRA.test(seguinte);
    });

    if (!achado) {
      comum += texto[i];
      i += 1;
      continue;
    }

    guardaComum();
    partes.push({ texto: `@${depoisDaArroba.slice(0, achado.nome.length)}`, mencao: achado.email });
    i += 1 + achado.nome.length;
  }

  guardaComum();
  return partes;
}

/** Os e-mails mencionados no texto, sem repetição e na ordem em que aparecem. */
export function mencoesNoTexto(texto: string, pessoas: PessoaMencionavel[]): string[] {
  const vistos = new Set<string>();
  for (const parte of separarMencoes(texto, pessoas)) {
    if (parte.mencao) vistos.add(parte.mencao);
  }
  return [...vistos];
}

/**
 * O que está sendo digitado depois de uma arroba, para a lista de sugestões.
 *
 * Devolve `null` quando não há menção em curso no ponto onde está o cursor — e
 * é isso que fecha a lista sozinha quando a pessoa termina de escrever o nome e
 * segue a frase.
 *
 * Aceita espaço no meio do termo porque os nomes têm espaço ("Ana Paula"), mas
 * para no segundo: sem esse limite, a frase inteira depois de uma arroba
 * viraria busca, e a lista nunca mais fecharia.
 */
export function mencaoEmCurso(texto: string, cursor: number): { termo: string; inicio: number } | null {
  const ate = texto.slice(0, cursor);
  const arroba = ate.lastIndexOf("@");
  if (arroba === -1) return null;

  /* Arroba colada em palavra é e-mail ou usuário, não menção. */
  const anterior = ate[arroba - 1];
  if (anterior && CONTINUA_A_PALAVRA.test(anterior)) return null;

  const termo = ate.slice(arroba + 1);
  if (termo.includes("\n")) return null;
  if ((termo.match(/ /g) || []).length > 1) return null;

  return { termo, inicio: arroba };
}

/** As pessoas que servem para o termo digitado, já ordenadas para a lista. */
export function sugestoesDeMencao<T extends PessoaMencionavel>(
  termo: string,
  pessoas: T[],
  limite = 6
): T[] {
  const busca = termo.trim().toLowerCase();
  const casa = (p: T) =>
    !busca ||
    p.name?.toLowerCase().includes(busca) ||
    p.email?.toLowerCase().includes(busca);

  /* Quem COMEÇA com o que foi digitado vem antes de quem só contém: digitar
     "an" deve trazer "Ana" antes de "Luciano". */
  const comeca = (p: T) => (p.name?.toLowerCase().startsWith(busca) ? 0 : 1);

  return pessoas
    .filter(casa)
    .sort((a, b) => comeca(a) - comeca(b) || (a.name || "").localeCompare(b.name || ""))
    .slice(0, limite);
}
