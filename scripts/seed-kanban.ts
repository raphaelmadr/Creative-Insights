/**
 * Demandas de teste para o Kanban.
 *
 * Todo card criado aqui leva `__seed: true` dentro de `values`. É por essa
 * chave que `limpar()` os encontra — e não pelo título nem pela data de
 * criação, que alguém pode editar sem perceber que transformou um card de teste
 * em dado de verdade, ou o contrário.
 *
 * Uso:
 *   npx tsx scripts/seed-kanban.ts demo     # 100 demandas variadas
 *   npx tsx scripts/seed-kanban.ts ia       #   5 vindas do gerador de copy
 *   npx tsx scripts/seed-kanban.ts limpar   # apaga TODAS as de teste
 *
 * `limpar` não toca em card sem a marca: uma demanda aberta de verdade durante
 * o teste sobrevive à faxina.
 */
import prisma from "../lib/prisma";
import { COPY_CHANNELS, formatsForChannel } from "../lib/copy-options";
import { parseCopyVariations } from "../lib/copy-parse";
import { serializeAssignees, PRIORITIES } from "../lib/kanban";

const OBJETIVOS = [
  "Reativar base inativa há 90 dias com foco em plano anual.",
  "Apresentar a linha de inverno para quem já alugou no ano passado.",
  "Recuperar carrinho abandonado nas últimas 72 horas.",
  "Divulgar a parceria com o criador de conteúdo de moda masculina.",
  "Testar ângulo de preço contra ângulo de conveniência.",
  "Reforçar prova social com depoimentos de clientes recorrentes.",
  "Anunciar frete grátis acima de R$ 300 na categoria festas.",
  "Captar leads para a lista de espera da coleção cápsula.",
  "Explicar como funciona o aluguel para quem nunca alugou.",
  "Retomar contato com quem abandonou o cadastro na metade.",
];

const TITULOS = [
  "Campanha de aniversário", "Coleção inverno", "Reativação de base", "Black Friday",
  "Lançamento cápsula", "Parceria com criador", "Festa junina", "Volta às aulas",
  "Dia das Mães", "Frete grátis", "Prova social", "Carrinho abandonado",
  "Onboarding de novos", "Retargeting 30 dias", "Categoria festas", "Categoria trabalho",
];

/** Aleatório com semente: a mesma execução gera o mesmo quadro, e dá para comparar. */
let semente = 42;
const rnd = () => ((semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));

const PECAS = [
  {
    titulo: "Reativação base fria — Criativos Meta",
    canal: "Meta (Facebook, Instagram, WhatsApp)",
    formato: "Feed e Stories",
    variacoes: [
      ["Dor", "Seu guarda-roupa não precisa crescer.", "Alugue a peça, use quantas vezes quiser e devolva. Sem acumular, sem se arrepender.", "Ver peças disponíveis", "Ataca a culpa de comprar por impulso, que é o freio real dessa base."],
      ["Preço", "A peça de R$ 1.200 por R$ 89.", "É o mesmo vestido, a mesma etiqueta, o mesmo evento. Muda só quanto tempo ele fica com você.", "Quero ver o preço", "Número concreto na headline segura o polegar antes do \"ver mais\"."],
      ["Conveniência", "Chega lavado. Volta sem você lavar.", "A gente entrega, você usa, a gente busca. O resto é problema nosso.", "Como funciona", "Tira o atrito que mais aparece em pesquisa com quem nunca alugou."],
    ],
  },
  {
    titulo: "Coleção cápsula — E-mails",
    canal: "CRM",
    formato: "Disparo Email",
    variacoes: [
      ["Exclusividade", "Você tem 48h antes de todo mundo.", "A cápsula de inverno abre para a lista antes de ir ao site. São 32 peças, e as favoritas somem primeiro.", "Ver antes de todos", "Prazo curto e estoque nomeado: as duas coisas que fazem a base abrir."],
      ["Curadoria", "Escolhemos 8 peças pensando em você.", "Baseado no que você alugou nos últimos seis meses. Se errarmos, é só devolver.", "Ver minha seleção", "Personalização declarada aumenta abertura em base recorrente."],
    ],
  },
  {
    titulo: "Parceria criador de moda — Peças de parceria",
    canal: "Parcerias",
    formato: "Todos os formatos e tamanhos",
    variacoes: [
      ["Voz do parceiro", "Eu não compro mais roupa de festa.", "Há dois anos eu alugo. Mesmo armário, metade do espaço, nenhuma peça parada.", "Ver o que ela alugou", "Primeira pessoa e sem menção à marca na abertura: é o que separa conteúdo de anúncio."],
      ["Prova", "Três eventos, três looks, um preço.", "O que ela gastaria em um vestido deu para alugar os três. A conta está no story.", "Fazer a minha conta", "Comparação numérica funciona melhor que adjetivo para essa audiência."],
    ],
  },
  {
    titulo: "Frete grátis categoria festas — Slides do site",
    canal: "Site",
    formato: "Slide",
    variacoes: [
      ["Oferta direta", "Frete grátis acima de R$ 300", "Em toda a categoria Festas, até domingo.", "Ver festas", "Quem está na home já entrou para comprar: a vitrine qualifica, não apresenta."],
      ["Urgência", "Até domingo, o frete é por nossa conta.", "Categoria Festas, pedidos acima de R$ 300.", "Aproveitar", "Prazo na headline em vez de no corpo, porque o slide é lido em um segundo."],
    ],
  },
  {
    titulo: "Retargeting 30 dias — Criativos PMax",
    canal: "Google (PMax)",
    formato: "Quadrado 1:1 (1200x1200)",
    variacoes: [
      ["Retomada", "Ainda dá tempo para o evento.", "A peça que você olhou continua disponível. Entrega em até 2 dias.", "Voltar ao carrinho", "Cada linha se sustenta sozinha, porque o PMax as remonta fora de ordem."],
      ["Garantia", "Não serviu? A troca é grátis.", "Você prova em casa. Se não for, a gente busca e manda outra.", "Alugar sem risco", "Remove a objeção de caimento, a maior em aluguel de roupa."],
      ["Estoque", "Restam 3 na sua numeração.", "As peças mais pedidas saem primeiro nos fins de semana de evento.", "Garantir a minha", "Escassez verificável — só usar quando o estoque confirmar."],
    ],
  },
];

const monta = (vs: string[][]) =>
  vs
    .map(
      ([angulo, headline, corpo, cta, razao], i) =>
        `### Variação ${i + 1} — ${angulo}\n**Headline:** ${headline}\n**Corpo:** ${corpo}\n**CTA:** ${cta}\n**Por que deve funcionar:** ${razao}`
    )
    .join("\n\n");

export async function semearDemo() {
  const board = await prisma.board.findFirst({
    where: { archived: false },
    include: { columns: { orderBy: { position: "asc" } } },
  });
  if (!board) throw new Error("nenhum quadro ativo");

  const pessoas = (await prisma.user.findMany({ select: { email: true } }))
    .map((u) => u.email)
    .filter((e): e is string => !!e && e !== "dev@allugator.com");

  const base = (await prisma.boardCard.aggregate({ _max: { code: true } }))._max.code ?? 0;
  const hoje = new Date();

  const dados = [];
  for (let i = 0; i < 100; i++) {
    const canal = pick(COPY_CHANNELS);
    const formatos = formatsForChannel(canal.id);
    const formato = pick(formatos);
    const coluna = pick(board.columns);
    const pecas = int(1, 12);

    // Prazos espalhados: vencidos, hoje e futuros — para ver o vermelho do atraso.
    const prazo = new Date(hoje.getTime() + int(-20, 45) * 86400000);
    prazo.setUTCHours(12, 0, 0, 0);

    // Alguns sem dono de propósito: "sem dono" é um estado real do quadro.
    const quantos = rnd() < 0.15 ? 0 : int(1, 3);
    const donos: string[] = [];
    while (donos.length < quantos) {
      const p = pick(pessoas);
      if (!donos.includes(p)) donos.push(p);
    }

    const origem = rnd() < 0.15 ? "PUBLIC" : rnd() < 0.3 ? "COPY" : "FORM";

    dados.push({
      code: base + 1 + i,
      boardId: board.id,
      columnId: coluna.id,
      title: `${pick(TITULOS)} — ${formato.label}`,
      description: pick(OBJETIVOS),
      priority: pick(PRIORITIES),
      dueDate: prazo,
      assignees: serializeAssignees(donos),
      assigneeEmail: donos[0] ?? null,
      requesterEmail: origem === "PUBLIC" ? pick(pessoas) : pick(pessoas),
      requesterName: null,
      linkUrl: rnd() < 0.4 ? "https://drive.google.com/drive/folders/exemplo" : null,
      origin: origem,
      completedAt: coluna.isDone ? new Date() : null,
      position: i,
      values: JSON.stringify({
        __seed: true,
        objetivo_da_peca: pick(OBJETIVOS),
        canal: canal.label,
        formato: formato.label,
        data_esperada: prazo.toISOString().slice(0, 10),
        numero_de_pecas: pecas,
      }),
    });
  }

  await prisma.boardCard.createMany({ data: dados });

  const porCanal = new Map<string, number>();
  const porColuna = new Map<string, number>();
  let totalPecas = 0;
  for (const d of dados) {
    const v = JSON.parse(d.values);
    porCanal.set(v.canal, (porCanal.get(v.canal) ?? 0) + 1);
    const nome = board.columns.find((c) => c.id === d.columnId)!.name;
    porColuna.set(nome, (porColuna.get(nome) ?? 0) + 1);
    totalPecas += v.numero_de_pecas;
  }

  console.log(`criados: ${dados.length} cards — MKT-${base + 1} a MKT-${base + 100}`);
  console.log(`volumetria total: ${totalPecas} peças\n`);
  console.log("por canal:");
  for (const [k, n] of [...porCanal].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(40)} ${n}`);
  console.log("\npor etapa:");
  for (const c of board.columns) console.log(`  ${c.name.padEnd(20)} ${porColuna.get(c.name) ?? 0}`);
}

export async function semearIA() {
  const board = await prisma.board.findFirst({
    where: { archived: false },
    include: { columns: { orderBy: { position: "asc" } } },
  });
  const aFazer = board!.columns.find((c) => c.name === "A fazer") ?? board!.columns[0];
  const pessoas = (await prisma.user.findMany({ select: { email: true } }))
    .map((u) => u.email!)
    .filter((e) => e && e !== "dev@allugator.com");

  let code = ((await prisma.boardCard.aggregate({ _max: { code: true } }))._max.code ?? 0) + 1;
  const prazo = new Date(Date.now() + 9 * 86400000);
  prazo.setUTCHours(12, 0, 0, 0);

  for (const [i, p] of PECAS.entries()) {
    const copyText = monta(p.variacoes);
    const variacoes = parseCopyVariations(copyText);
    if (variacoes.length !== p.variacoes.length) {
      throw new Error(`"${p.titulo}": o parser leu ${variacoes.length} de ${p.variacoes.length} variações`);
    }

    await prisma.boardCard.create({
      data: {
        code: code++,
        boardId: board!.id,
        columnId: aFazer.id,
        title: `${p.titulo} • ${p.variacoes.length} Peças`,
        description: `**Produto:** Aluguel de peças · **Público:** ${p.canal} · **Formato:** ${p.formato}`,
        priority: ["ALTA", "MEDIA", "URGENTE", "MEDIA", "ALTA"][i],
        dueDate: prazo,
        assignees: serializeAssignees([pessoas[i % pessoas.length]]),
        assigneeEmail: pessoas[i % pessoas.length],
        requesterEmail: pessoas[(i + 3) % pessoas.length],
        copyText,
        origin: "COPY",
        position: -10 + i,
        values: JSON.stringify({
          __seed: true,
          objetivo_da_peca: `Gerada pelo assistente para ${p.canal}.`,
          canal: p.canal,
          formato: p.formato,
          data_esperada: prazo.toISOString().slice(0, 10),
          numero_de_pecas: p.variacoes.length,
        }),
      },
    });
    console.log(`  MKT-${code - 1}  ${p.titulo}  (${variacoes.length} variações lidas pelo parser)`);
  }
  console.log("\ntodas em \"A fazer\", origem COPY.");
}

/** Apaga só o que foi semeado. Ver a marca `__seed` no cabeçalho. */
export async function limpar() {
  const cards = await prisma.boardCard.findMany({ select: { id: true, values: true } });
  const doTeste = cards.filter((c) => {
    try {
      return JSON.parse(c.values || "{}").__seed === true;
    } catch {
      return false;
    }
  });

  await prisma.boardCard.deleteMany({ where: { id: { in: doTeste.map((c) => c.id) } } });
  console.log(`apagados: ${doTeste.length} de ${cards.length} cards (os demais não são de teste)`);
}

async function main() {
  const modo = process.argv[2];
  if (modo === "demo") await semearDemo();
  else if (modo === "ia") await semearIA();
  else if (modo === "limpar") await limpar();
  else {
    console.log("modos: demo | ia | limpar");
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}

main();
