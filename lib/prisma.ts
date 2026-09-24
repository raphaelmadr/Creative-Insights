/**
 * O cliente do Prisma — UM, para todo o processo.
 *
 * Cada `new PrismaClient()` abre a sua própria reserva de conexões. O MySQL é o
 * da hospedagem e tem `max_user_connections`: dois clientes no mesmo processo
 * não são só desperdício de memória, são duas reservas disputando um teto que
 * o painel inteiro compartilha — e, quando ele estoura, o login é a primeira
 * coisa a cair.
 *
 * O arquivo dizia fazer isso e fazia o contrário:
 *
 *     const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()
 *     if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = undefined; globalThis.prismaGlobal = prismaClientSingleton();
 *
 * Sem chaves, o `if` governa apenas a primeira atribuição; a segunda roda
 * SEMPRE, em produção inclusive, e cria um cliente novo a cada vez que este
 * módulo é avaliado. Na primeira carga eram dois clientes — o que a aplicação
 * usa e o que ficou guardado no global sem uso. Em desenvolvimento, onde o
 * módulo é reavaliado a cada alteração de arquivo, era um cliente novo por
 * recarga, cada um segurando as suas conexões: exatamente o quadro em que o
 * banco começa a recusar ligação no meio da tarde.
 *
 * Abaixo, o guardado é o MESMO que a aplicação usa, e só em desenvolvimento —
 * em produção o módulo é avaliado uma vez e não há por que sujar o global.
 */

import { PrismaClient } from "@prisma/client";

/*
 * `PRISMA_LOG_QUERIES=1` imprime cada consulta com o tempo dela.
 *
 * Existe para medir: "esta tela está lenta" só vira conserto quando se sabe
 * quantas idas ao banco uma requisição faz. Fica desligado por padrão porque o
 * log é ruidoso e mede a si mesmo quando ligado o tempo todo.
 */
const prismaClientSingleton = () =>
  new PrismaClient(
    process.env.PRISMA_LOG_QUERIES === "1"
      ? { log: [{ emit: "stdout", level: "query" }] }
      : undefined
  );

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;
