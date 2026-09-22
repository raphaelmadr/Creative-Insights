/**
 * O gerador de copy — e a entrega automática no Kanban.
 *
 * A copy pronta não fica numa tela que se fecha: ela vira card no quadro que
 * recebe copys, já com o briefing preenchido e o nome de quem pediu. É esse
 * passo que faz o gerador ser parte da ferramenta, e não mais um chat de onde
 * alguém copia e cola o resultado em outro lugar.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentCreator } from "@/lib/auth";
import { CREATOR_ONLY_ERROR } from "@/lib/roles";
import { AI_MAX_TOKENS, isAiConfigured, resolveAiChain } from "@/lib/ai";
import {
  generateCopy,
  briefProductName,
  type CopyBrief,
} from "@/lib/creator-copy";
import { copyTargetBoard, groupIntake, topPosition, logActivity } from "@/lib/kanban-store";
import { isPriority, optionsFor, parseDueDate, serializeAssignees,
  criarCardComCodigo, validateValues, camposObrigatoriosFaltando, camposVisiveis,
} from "@/lib/kanban";
import {
  buildCopyCardTitle,
  clampBodyMaxWords,
  clampVariations,
  guessPieceKind,
  findChannel,
  findFormat,
  findTone,
  isCopyMode,
  isOtherOption,
} from "@/lib/copy-options";
import { sanitizeAttachments, serializeAttachments } from "@/lib/attachments";
import { resolveStorageConfig } from "@/lib/media-upload";
import { parseCopyVariations } from "@/lib/copy-parse";
import { findAlluProduct, describePricing } from "@/lib/allu-catalog";

/* A forma inteira do campo, e não só o que este arquivo lê: `camposVisiveis`
   precisa das opções e da regra de exibição para decidir o que ainda vale
   perguntar. É `FieldShape` de `lib/kanban`, com os nomes escritos aqui porque
   as linhas do Prisma já os têm todos. */
type CampoQuadro = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string | null;
  dependsOn?: string | null;
  showWhenKey?: string | null;
  showWhenValues?: string | null;
};

/**
 * Os campos obrigatórios deste quadro que o gerador NÃO sabe preencher por
 * conta própria — tudo, menos canal, formato e o campo de peças, que ele já
 * deduz do briefing (ver `respostas` no POST, abaixo).
 *
 * Usada nos dois lados: no GET, pra anunciar de antemão TUDO que falta
 * perguntar, antes de qualquer tentativa de envio (a tela pedia isso só
 * depois de um primeiro clique recusado); no POST, pra checar o que ainda
 * ficou em branco depois que a tela já perguntou. Antes disto, só "Frente"
 * entrava nessa checagem — um quadro com outro campo obrigatório qualquer
 * travava o envio com um erro genérico e nenhum jeito de responder pelo
 * próprio gerador.
 */
function camposExtrasDoGerador(camposDoQuadro: CampoQuadro[]): CampoQuadro[] {
  const acharPorNome = (nome: string) =>
    camposDoQuadro.find((f) => f.key === nome || f.label.trim().toLowerCase() === nome) ?? null;

  const autoPreenchidos = new Set(
    [
      acharPorNome("canal"),
      acharPorNome("formato"),
      camposDoQuadro.find((f) => f.type === "RANGE" || f.type === "NUMBER") ?? null,
    ]
      .filter((f): f is CampoQuadro => !!f)
      .map((f) => f.key)
  );

  return camposDoQuadro.filter((f) => f.required && !autoPreenchidos.has(f.key));
}

/** Onde a copy vai cair, para a tela poder dizer isso antes de gerar. */
export async function GET() {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const target = await copyTargetBoard();
    const column = target
      ? await prisma.boardColumn.findUnique({
          where: { id: target.columnId },
          select: { name: true, groupId: true },
        })
      : null;

    /*
     * Os grupos do quadro, com a etapa em que cada um recebe o que chega.
     *
     * A tela precisa da etapa para dizer a verdade: ela anuncia onde a copy vai
     * cair antes de enviar, e esse destino muda conforme o time escolhido. Sem
     * isso, o aviso continuaria mostrando a etapa do grupo padrão qualquer que
     * fosse a escolha.
     */
    const etapas = target
      ? await prisma.boardColumn.findMany({
          where: { boardId: target.board.id },
          orderBy: { position: "asc" },
          select: { name: true, groupId: true },
        })
      : [];

    const groups = target
      ? (
          await prisma.boardGroup.findMany({
            where: { boardId: target.board.id },
            orderBy: { position: "asc" },
            select: { id: true, name: true },
          })
        )
          .map((g) => ({
            ...g,
            columnName: etapas.find((e) => e.groupId === g.id)?.name ?? null,
          }))
          /*
           * Grupo sem etapa nenhuma não entra na lista: escolhê-lo mandaria a
           * copy para a entrada do quadro, que é de outro time, sem nada na
           * tela dizendo que foi isso que aconteceu.
           */
          .filter((g) => g.columnName)
      : [];

    /*
     * O que este quadro pergunta, e o gerador não sabe responder por conta
     * própria — anunciado já na abertura da tela, e não só depois de uma
     * primeira tentativa de envio recusada. Ver `camposExtrasDoGerador`.
     */
    const missingFields = target
      ? camposExtrasDoGerador(
          /*
           * Sem nenhuma resposta ainda, campo condicional não entra: anunciá-lo
           * na abertura perguntaria o nome do evento a quem talvez nem vá pedir
           * um. Ele é cobrado depois, no envio, se a frente que o gerador
           * deduziu do briefing acender a regra — e aí volta em `missingFields`
           * do 400, que é o caminho por onde esta tela já sabe perguntar.
           */
          camposVisiveis(
            await prisma.boardField.findMany({
              where: { boardId: target.board.id },
              orderBy: { position: "asc" },
            }),
            {}
          )
        )
      : [];

    /*
     * O canal e o formato COMO O QUADRO OS DEFINE.
     *
     * O gerador tinha uma lista própria em `lib/copy-options.ts` e oferecia
     * aquela. As duas não se encontravam: o quadro define nove formatos para
     * Parcerias, e a tela mostrava um só — "Todos os formatos e tamanhos" —,
     * porque era isso que a lista fixa dizia. Pior, o card criado saía com o
     * campo Formato VAZIO, já que a resposta escolhida aqui não existia entre as
     * opções de lá.
     *
     * Vão as duas definições inteiras, com o `dependsOn` e o mapa de opções, para
     * a tela resolver a dependência com a mesma função que o formulário do
     * quadro usa (`optionsFor`) em vez de reimplementar a regra.
     */
    const camposDoQuadro = target
      ? await prisma.boardField.findMany({
          where: { boardId: target.board.id },
          orderBy: { position: "asc" },
        })
      : [];

    const acharCampo = (chave: string) =>
      camposDoQuadro.find(
        (f) => f.key === chave || f.label.trim().toLowerCase() === chave
      ) ?? null;

    const comoCampo = (f: (typeof camposDoQuadro)[number] | null) =>
      f
        ? {
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required,
            options: f.options,
            dependsOn: f.dependsOn,
            helpText: f.helpText,
          }
        : null;

    /*
     * O teto de saída de quem vai atender — o PRIMEIRO da cadeia, não o maior.
     *
     * Um provedor que trunca a resposta ainda responde com sucesso, então a
     * cadeia de fallback não passa a vez: quem define o tamanho máximo do que
     * volta é quem atende primeiro. A tela usa isto para avisar, antes de gerar,
     * que a página pedida não cabe numa resposta só.
     */
    const cadeia = await resolveAiChain(
      await prisma.systemSettings.findUnique({ where: { id: 1 } })
    );

    return NextResponse.json({
      success: true,
      aiConfigured: await isAiConfigured(),
      outputCeiling: cadeia[0]?.provider.maxOutputTokens ?? AI_MAX_TOKENS,
      missingFields,
      groups,
      briefFields: {
        canal: comoCampo(acharCampo("canal")),
        formato: comoCampo(acharCampo("formato")),
      },
      target: target
        ? {
            boardId: target.board.id,
            boardName: target.board.name,
            columnName: column?.name ?? null,
            /*
             * O grupo dono da entrada do quadro é o que a tela já vem marcando.
             * Não escolher nada tem de continuar fazendo o que sempre fez — a
             * copy caindo exatamente onde caía —, e agora com o time do grupo
             * junto, que é o que faltava.
             */
            groupId: column?.groupId ?? null,
          }
        : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Monta o briefing a partir do que a tela mandou.
 *
 * A tela envia **ids** — do produto no catálogo, do público no Meta, do formato
 * e do tom —, e é aqui que eles viram objeto. O preço nunca chega pelo corpo da
 * requisição: ele é buscado pelo id, no servidor. Aceitar o preço do cliente
 * seria deixar o valor do anúncio à mercê do que a aba tinha em memória desde
 * que foi aberta — ou de quem resolvesse editá-lo.
 */
async function buildBrief(body: any): Promise<CopyBrief> {
  /*
   * O id de "Outro / especifique" não é um id: é a forma de dizer que o item não
   * está cadastrado. Procurá-lo no catálogo devolveria nada, e a pessoa receberia
   * "este produto não está mais disponível" por ter dito justamente que ele não
   * está lá. A tela já o converte em nulo; a rota não confia nisso.
   */
  /*
   * Os ids chegam como LISTA — uma demanda cobre o lançamento inteiro, os iPhone
   * 16 e 17 na mesma leva. O `productId` no singular ainda é aceito para que uma
   * aba aberta antes desta mudança continue funcionando.
   */
  const brutos: unknown[] = Array.isArray(body.productIds)
    ? body.productIds
    : body.productId
      ? [body.productId]
      : [];

  const productIds = brutos
    .map((id) => String(id))
    .filter((id) => id && !isOtherOption(id));

  /*
   * Buscados em paralelo, e o que não existe mais cai fora aqui — a checagem de
   * "sumiu do catálogo" logo abaixo compara as duas contagens.
   */
  const encontrados = await Promise.all(productIds.map((id) => findAlluProduct(id)));
  const products = encontrados.filter((p): p is NonNullable<typeof p> => !!p);

  /* O rótulo do formato, resolvido uma vez: ele responde duas perguntas — qual
     é o formato e que tipo de peça ele é. */
  const formatLabel = body.format?.trim() || findFormat(body.formatId)?.label || undefined;

  return {
    products,
    productName: body.productName?.trim() || undefined,
    objective: String(body.objective || "").trim(),
    toneId: findTone(body.toneId)?.id,
    toneText: body.toneText?.trim() || undefined,
    /*
     * Canal e formato são os RÓTULOS das opções do quadro, e é a tela quem os
     * manda assim. Os ids da lista fixa antiga (`channelId`, `formatId`) ainda
     * são aceitos e convertidos em rótulo: uma aba aberta antes desta mudança
     * continua conseguindo enviar em vez de criar um card sem canal nenhum.
     */
    channel:
      body.channel?.trim() ||
      findChannel(body.channelId)?.label ||
      findChannel(findFormat(body.formatId)?.channelId)?.label ||
      undefined,
    format: formatLabel,
    constraints: body.constraints?.trim() || undefined,
    variations: clampVariations(body.variations),
    /*
     * O tipo da peça sai do FORMATO, aqui como na tela — não do que o corpo da
     * requisição afirma ser.
     *
     * Ele deixou de ser uma escolha: quem seleciona "Reels (9:16)" já disse que
     * a peça é um vídeo. Derivar nos dois lados a partir do mesmo rótulo é o que
     * garante que a tela e o prompt nunca discordem — lendo o `pieceKind`
     * enviado, uma tela desatualizada pediria um roteiro com formato de estático
     * e ninguém veria a divergência.
     *
     * O teto é preso à faixa aceita: o número vem de um campo numérico, onde
     * nada impede digitar 99999 e pedir ao modelo mais do que ele consegue
     * devolver.
     */
    pieceKind: guessPieceKind(formatLabel),
    bodyMaxWords: clampBodyMaxWords(body.bodyMaxWords, guessPieceKind(formatLabel)),
  };
}

export async function POST(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const body = await request.json();
    const brief = await buildBrief(body);

    /*
     * Quem escreve. No manual a rota não chama modelo nenhum: ela recebe o texto
     * pronto da tela e cria o card. O padrão continua sendo a IA — uma versão
     * antiga da tela, ou qualquer chamada que não conheça o campo, segue se
     * comportando como antes.
     */
    const mode = isCopyMode(body.mode) ? body.mode : "ai";

    /*
     * O id que não resolve vem antes da checagem de "está vazio".
     *
     * Na ordem inversa, quem escolheu um produto que saiu do catálogo recebia
     * "escolha um produto ou descreva a oferta" — uma mensagem que manda fazer
     * exatamente o que a pessoa acabou de fazer. A causa real é outra, e é ela
     * que a tela precisa dizer.
     */
    const pedidos = (
      Array.isArray(body.productIds) ? body.productIds : body.productId ? [body.productId] : []
    ).filter((id: unknown) => id && !isOtherOption(String(id)));

    if (pedidos.length > (brief.products?.length ?? 0)) {
      return NextResponse.json(
        {
          error:
            pedidos.length === 1
              ? "Este produto não está mais disponível no catálogo. Atualize a lista."
              : "Um dos produtos escolhidos não está mais disponível no catálogo. Atualize a lista.",
        },
        { status: 400 }
      );
    }

    /*
     * O produto pode vir da lista ou digitado, e o público idem — o que não pode
     * é faltar. Exigir o id do catálogo deixaria de fora a campanha
     * institucional e o produto que ainda não subiu no site.
     */
    if (!briefProductName(brief)) {
      return NextResponse.json(
        { error: "Escolha um produto do catálogo ou descreva a oferta." },
        { status: 400 }
      );
    }
    /*
     * O quadro de destino e os campos dele, buscados UMA vez.
     *
     * Sobem para cá porque agora é o quadro que define canal e formato: a
     * validação precisa deles antes de qualquer chamada de modelo, para não
     * gastar uma geração inteira num pedido que o quadro vai recusar. O
     * `target` nulo continua sendo tratado adiante, onde ele de fato impede o
     * envio — gerar copy sem quadro configurado sempre funcionou.
     */
    const target = await copyTargetBoard();
    const camposDoQuadro = target
      ? await prisma.boardField.findMany({
          where: { boardId: target.board.id },
          orderBy: { position: "asc" },
        })
      : [];

    const acharCampo = (chave: string) =>
      camposDoQuadro.find(
        (f) => f.key === chave || f.label.trim().toLowerCase() === chave
      ) ?? null;

    const campoCanal = acharCampo("canal");
    const campoFormato = acharCampo("formato");

    /*
     * Canal e formato viram resposta do card AQUI, e já validados.
     *
     * Antes eram adivinhados no fim, por `matchOption`, tentando casar o rótulo
     * da lista fixa do gerador com o da opção do quadro — "Feed 1:1" de um lado,
     * "Feed Quadrado (1:1)" do outro. Quando não casava, e quase nunca casava, o
     * campo ficava VAZIO no card: a demanda chegava ao quadro sem dizer o
     * formato que ela mesma pediu. Com a tela oferecendo as opções do quadro, o
     * que chega aqui já é uma delas, e o que resta é conferir.
     */
    const respostasDoBriefing: Record<string, unknown> = {};

    if (campoCanal && brief.channel) {
      const permitidos = optionsFor(campoCanal, {});
      if (permitidos.length && !permitidos.includes(brief.channel)) {
        return NextResponse.json(
          { error: `"${brief.channel}" não é uma opção de ${campoCanal.label} neste quadro.` },
          { status: 400 }
        );
      }
      respostasDoBriefing[campoCanal.key] =
        campoCanal.type === "MULTISELECT" ? [brief.channel] : brief.channel;
    }

    if (campoFormato && brief.format) {
      /*
       * Depois do canal, de propósito: o formato depende dele para saber quais
       * opções existem. E o canal entra como TEXTO, não como a resposta já
       * gravada: num quadro onde alguém tornasse o canal um campo de escolha
       * múltipla, a resposta seria uma lista, `optionsFor` não acharia a chave
       * do mapa e devolveria zero formatos — recusando, em silêncio, qualquer
       * formato que a tela oferecesse.
       */
      const permitidos = campoCanal
        ? optionsFor(campoFormato, { [campoCanal.key]: brief.channel ?? "" })
        : optionsFor(campoFormato, {});
      if (permitidos.length && !permitidos.includes(brief.format)) {
        return NextResponse.json(
          {
            error: `"${brief.format}" não é um formato de ${brief.channel ?? "canal nenhum"} neste quadro.`,
          },
          { status: 400 }
        );
      }
      respostasDoBriefing[campoFormato.key] =
        campoFormato.type === "MULTISELECT" ? [brief.format] : brief.format;
    }

    /*
     * O objetivo é exigido só de quem vai gerar: ele existe para o modelo saber
     * por que a peça está sendo escrita. No manual quem sabe isso é a pessoa que
     * está escrevendo, e transformá-lo em obrigação seria cobrar o preenchimento
     * de um briefing que ninguém vai ler.
     */
    if (mode === "ai") {
      if (!brief.objective) {
        return NextResponse.json({ error: "O objetivo é obrigatório." }, { status: 400 });
      }

      if (!(await isAiConfigured())) {
        return NextResponse.json(
          { error: "Nenhuma IA configurada. Adicione uma chave em Configurações → IA." },
          { status: 400 }
        );
      }
    }

    /*
     * Só gera quando é PRA revisar — não quando já foi revisado.
     *
     * `sendToBoard` chega com `editedCopy`: o texto que a pessoa já leu e
     * aprovou na tela. Gerar de novo aqui é chamar o modelo (segundos) para
     * um resultado que `finalText`, embaixo, joga fora em favor do que veio
     * editado — era essa chamada inteira, descartada, que fazia "Enviar ao
     * Board" demorar no modo IA.
     */
    const { text, winners, formatIssues } =
      mode === "ai" && !body.sendToBoard
        ? await generateCopy(brief)
        : {
            text: "",
            winners: [] as Awaited<ReturnType<typeof generateCopy>>["winners"],
            formatIssues: [] as string[],
          };

    /*
     * Gerar não é entregar.
     *
     * A primeira versão criava o card junto com a geração, e o quadro encheu de
     * copy que ninguém tinha lido — inclusive tentativas descartadas na hora. A
     * pessoa lê, ajusta o briefing, gera de novo, e só então envia.
     */
    if (!body.sendToBoard) {
      if (mode === "manual") {
        return NextResponse.json(
          { error: "No modo manual não há o que gerar — escreva as peças e envie ao quadro." },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        copy: text,
        referencesUsed: winners.length,
        variations: brief.variations,
        /*
         * O que continuou fora do formato depois da rodada de correção. Não é
         * erro — o texto veio e é editável —, mas quem pediu uma landing page e
         * recebeu um parágrafo precisa saber disso sem ter que conferir seção
         * por seção.
         */
        formatIssues,
      });
    }

    if (!target) {
      return NextResponse.json(
        { error: "Nenhum quadro configurado para receber copys." },
        { status: 400 }
      );
    }

    const finalText =
      typeof body.editedCopy === "string" && body.editedCopy.trim()
        ? body.editedCopy.trim()
        : text;

    // No manual não há texto de reserva: se a tela não mandou nada escrito, o
    // card entraria no quadro vazio, e ninguém saberia disso até abri-lo.
    if (mode === "manual" && !finalText) {
      return NextResponse.json(
        { error: "Escreva ao menos uma peça antes de enviar ao quadro." },
        { status: 400 }
      );
    }
    /*
     * Na IA, o texto de reserva era a própria geração — que parou de rodar
     * aqui (ver acima). Sem ela, enviar sem ter gerado (ou com o campo de
     * edição zerado) criaria um card vazio em silêncio, em vez de avisar.
     */
    if (mode === "ai" && !finalText) {
      return NextResponse.json(
        { error: "Gere a copy e revise o texto antes de enviar ao quadro." },
        { status: 400 }
      );
    }

    /*
     * Os anexos chegam como URLs, e URL vinda do cliente é URL escolhida por
     * quem quiser: só passa o que aponta para o nosso próprio armazenamento —
     * o único lugar de onde o upload autenticado pode ter saído.
     */
    const settings = await prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { cpanelUploadUrl: true, cpanelUploadSecret: true },
    });
    const anexos = sanitizeAttachments(body.attachments, resolveStorageConfig(settings).host);

    const tom = findTone(brief.toneId);

    /*
     * A quantidade no título é contada no texto que será gravado, e não no que
     * foi pedido à IA: quem revisou pode ter descartado variações antes de
     * enviar, e um card que promete doze peças e entrega nove vira discussão no
     * dia da entrega. Sem cards reconhecíveis — a saída veio fora do formato e
     * está sendo editada como texto corrido —, vale o número pedido.
     */
    const pecas = parseCopyVariations(finalText).length || clampVariations(brief.variations);

    /*
     * Para qual time vai a copy.
     *
     * Mesma regra do formulário de demanda, e pelo mesmo motivo: o card cai na
     * primeira etapa do grupo escolhido e nasce com o time inteiro. Até aqui a
     * copy entrava no quadro sem dono nenhum — chegava na esteira e ficava
     * esperando alguém reparar nela.
     */
    /*
     * O que o gerador já sabe, escrito nos campos do formulário.
     *
     * Sem isto, o card vindo da copy é um card de segunda classe: não responde
     * às mesmas opções de exibição que os demais — "mostrar o canal" não mostra
     * nada nele — e nenhuma etiqueta acende, porque as etiquetas leem as
     * respostas do formulário. Ele tinha a informação; só não a guardava onde o
     * resto do quadro procura.
     *
     * Canal e formato já foram conferidos contra as opções do quadro lá em cima,
     * assim que o briefing foi montado — e entram prontos. Eram adivinhados aqui
     * por `matchOption`, tentando casar duas listas escritas em lugares
     * diferentes; quando não casava, o campo ficava vazio e a demanda chegava ao
     * quadro sem dizer o formato que ela mesma pediu.
     */
    const respostas: Record<string, unknown> = { ...respostasDoBriefing };

    /*
     * A volumetria vai junto — é o número que o gerador já sabe.
     *
     * O campo de peças do quadro é o que conta a entrega quando o card chega à
     * coluna de conclusão (ver `lib/kanban-deliveries.ts`). Sem preencher aqui,
     * uma demanda de doze copys entraria no ranking valendo UMA peça, e o
     * gerador — que é justamente quem sabe o número — ficaria de fora da conta.
     */
    const campoPecas =
      camposDoQuadro.find((f) => f.type === "RANGE" || f.type === "NUMBER") ?? null;
    if (campoPecas) respostas[campoPecas.key] = pecas;

    /*
     * O que o gerador NÃO sabe preencher sozinho, e a tela já perguntou.
     *
     * Canal/formato/peças vêm do que o gerador já coleta pra escrever a
     * copy — o resto (uma "Frente", por exemplo) não tem de onde vir daqui.
     * `extraRespostas` é o valor que a tela manda depois de perguntar isso
     * numa segunda rodada (ver `missingFields` abaixo). Só entra chave que é
     * campo de verdade deste quadro — o resto seria a tela mandando qualquer
     * coisa pra um card que ela não deveria conseguir escrever.
     */
    if (body.extraRespostas && typeof body.extraRespostas === "object") {
      for (const [chave, valor] of Object.entries(body.extraRespostas)) {
        if (camposDoQuadro.some((f) => f.key === chave)) respostas[chave] = valor;
      }
    }

    /*
     * O que sobrou obrigatório depois de canal/formato/peças (acima) e do que
     * a tela já perguntou em `extraRespostas` — "Frente" é o exemplo mais
     * comum, mas qualquer outro campo obrigatório do quadro entra aqui
     * também. Antes, só "Frente" era checado: um quadro com outro campo
     * obrigatório travava o envio com "O campo X é obrigatório" (erro
     * genérico do `validateValues`, mais abaixo) e nenhum jeito de responder
     * pelo próprio gerador — a demanda simplesmente não chegava no quadro.
     */
    /*
     * Só o que este quadro ainda pergunta, dadas as respostas que o gerador já
     * deduziu — o canal e o formato saem do briefing, e é justamente deles que
     * um campo condicional costuma depender ("Nome do evento" só quando a
     * frente for "Evento"). Cobrar um campo que a regra esconde travaria o
     * envio apontando para uma pergunta que a tela nunca mostrou.
     */
    const visiveis = camposVisiveis(camposDoQuadro, respostas);
    const faltando = camposObrigatoriosFaltando(camposExtrasDoGerador(visiveis), respostas);
    if (faltando.length) {
      return NextResponse.json(
        {
          error: `Responda "${faltando[0].label}" antes de enviar ao quadro.`,
          missingFields: faltando,
        },
        { status: 400 }
      );
    }

    /*
     * Validação de verdade — a mesma que o formulário manual e o link público
     * já confiam (`lib/kanban.ts`): confere opção válida, `dependsOn`, etc.
     * `faltando` acima só via "vazio ou não"; isto pega o resto (uma opção
     * que não existe mais no campo, por exemplo).
     */
    const validado = validateValues(camposDoQuadro, respostas);
    if (!validado.ok) {
      return NextResponse.json({ error: validado.error }, { status: 400 });
    }
    Object.assign(respostas, validado.values);

    const destino = await groupIntake(target.board.id, { groupId: body.groupId });
    if (!destino) {
      return NextResponse.json(
        { error: "O quadro que recebe copys ainda não tem colunas." },
        { status: 400 }
      );
    }

    const card = await criarCardComCodigo(prisma, async (code) =>
      prisma.boardCard.create({
        data: {
          // O número que a equipe usa para falar da demanda. Ver
          // `criarCardComCodigo` — ele é quem resolve a corrida por MAX+1.
          code,
          boardId: target.board.id,
          columnId: destino.columnId,
          assignees: serializeAssignees(destino.assignees),
          // Espelho do primeiro, enquanto a versão publicada ainda lê este campo.
          assigneeEmail: destino.assignees[0] ?? null,
          title:
          String(body.title ?? "").trim().slice(0, 180) ||
          buildCopyCardTitle({
            formatLabel: brief.format,
            productName: briefProductName(brief),
            variations: pecas,
          }),
          /*
           * O briefing vira a descrição do card, e não só a copy.
           *
           * Quem recebe a demanda precisa saber para quem e para quê o texto foi
           * escrito — sem isso, adaptar a copy à peça é adivinhação. O preço entra
           * aqui também: é o número que a arte vai estampar, e ele não pode
           * depender de alguém voltar ao site para conferir.
           */
          description: [
          `**Produto${(brief.products?.length ?? 0) > 1 ? "s" : ""}:** ${briefProductName(brief)}`,
          /*
           * Preço e link POR PRODUTO, um por linha. Eram um só, do produto
           * único; com vários, uma linha de preço sem dizer de quem é manda a
           * arte estampar o valor errado no aparelho errado.
           */
          ...(brief.products ?? []).map((p) =>
            (brief.products?.length ?? 0) > 1
              ? `**Preço — ${p.name}:** ${describePricing(p)}`
              : `**Preço:** ${describePricing(p)}`
          ),
          ...(brief.products ?? [])
            .filter((p) => p.url)
            .map((p) =>
              (brief.products?.length ?? 0) > 1
                ? `**No site — ${p.name}:** ${p.url}`
                : `**No site:** ${p.url}`
            ),
          brief.objective ? `**Objetivo:** ${brief.objective}` : null,
          brief.format ? `**Formato:** ${brief.format}` : null,
          brief.channel ? `**Canal:** ${brief.channel}` : null,
          tom ? `**Tom:** ${tom.label}` : null,
          // Sem tom da lista, o texto livre é o tom — ver `buildCopyPrompt`.
          brief.toneText
            ? tom
              ? `**Observação de tom:** ${brief.toneText}`
              : `**Tom:** ${brief.toneText}`
            : null,
          brief.constraints ? `**Restrições:** ${brief.constraints}` : null,
          ]
          .filter(Boolean)
          .join("\n"),
          copyText: finalText,
          values: Object.keys(respostas).length ? JSON.stringify(respostas) : null,
          attachments: serializeAttachments(anexos),
          origin: "COPY",
          /*
           * A prioridade não é mais escolhida no gerador.
           *
           * Ele perguntava "prioridade no quadro" logo abaixo da data de
           * entrega, e essa pergunta é do FORMULÁRIO — que a faz, ou não, por
           * decisão do quadro (`FORM_BUILTINS`). Com as duas, um quadro que
           * tinha desligado a prioridade continuava recebendo cards com
           * urgência marcada, vindos de outra tela.
           *
           * O corpo da requisição ainda é lido, para o cliente antigo que
           * continuar mandando o campo não perder o valor até publicar.
           */
          priority: isPriority(body.priority) ? body.priority : "MEDIA",
          /*
           * A data vem como "AAAA-MM-DD" do campo de data do navegador. Uma data
           * inválida vira nulo em vez de derrubar a criação do card: perder a copy
           * recém-aprovada por causa de um prazo mal digitado seria desproporcional.
           */
          dueDate: parseDueDate(body.dueDate),
          requesterEmail: user.email,
          requesterName: user.name,
          position: await topPosition(destino.columnId),
        },
      })
    );

    /*
     * O histórico registra quem escreveu, e não só que o card nasceu. Meses
     * depois, "esta copy foi da IA ou de alguém?" é a primeira pergunta de
     * quem compara o desempenho das peças.
     */
    await logActivity(
      card.id,
      "CREATED",
      mode === "manual"
        ? `escreveu ${pecas} peça(s) à mão`
        : winners.length
          ? `gerou ${pecas} variação(ões) com ${winners.length} peça(s) vencedora(s) como referência`
          : `gerou ${pecas} variação(ões) a partir do briefing`,
      user
    );

    return NextResponse.json({
      success: true,
      copy: finalText,
      referencesUsed: winners.length,
      card,
      board: { id: target.board.id, name: target.board.name },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
