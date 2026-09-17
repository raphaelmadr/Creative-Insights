/**
 * Os papéis, e até onde cada um vai.
 *
 * Vocabulário puro: sem Prisma, sem NextAuth. É o que permite a barra do topo
 * decidir no navegador o que mostrar usando a MESMA regra com que o servidor
 * barra a rota — `lib/auth.ts` importa daqui, e nunca o contrário. É a razão de
 * `lib/corporate-email.ts` existir, pelo mesmo motivo.
 *
 * Três degraus:
 *
 * - `ADMIN` administra a plataforma — metas, credenciais, prompts de IA, logs —
 *   e por isso alcança tudo o que existe abaixo.
 * - `CREATOR` é a equipe de produção: o board criativo e o gerador de copy.
 * - `MEMBER` é quem PEDE peça. Vê o painel de performance e abre demanda, que
 *   continua sendo a porta aberta para a empresa inteira.
 *
 * Uma escada, e não dois interruptores independentes, porque a pergunta que o
 * produto faz é "até onde esta pessoa vai", não "quais módulos ela tem". Com
 * interruptores existiria o administrador sem board: alguém que configura o
 * quadro por uma tela que não pode abrir.
 *
 * Três valores na MESMA coluna `User.role`, que já é texto — nenhuma migração,
 * e o banco é compartilhado entre desenvolvimento e produção.
 */

export type UserRole = "ADMIN" | "CREATOR" | "MEMBER";

/** Do mais alto para o mais baixo — é nesta ordem que a tela de acesso mostra. */
export const USER_ROLES: UserRole[] = ["ADMIN", "CREATOR", "MEMBER"];

export function isValidRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as string[]).includes(value);
}

/** Abre o painel de configurações globais. */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === "ADMIN";
}

/**
 * Abre o modo Creator — o board e o gerador de copy.
 *
 * O administrador entra por ser administrador, e não por ter um segundo papel:
 * quem responde pelas credenciais e pelos prompts precisa ver o quadro que eles
 * alimentam. Esta é a única linha do sistema que decide isso.
 */
export function hasCreatorAccess(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "CREATOR";
}

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "Administrador",
  CREATOR: "Creator",
  MEMBER: "Membro",
};

/** O que cada papel alcança, escrito para quem escolhe na tela de acesso. */
export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  ADMIN: "Configurações globais, board criativo, copy e abertura de demandas.",
  CREATOR: "Board criativo e gerador de copy, além do painel e das demandas.",
  MEMBER: "Painel de performance e abertura de demandas.",
};

/**
 * A recusa do modo Creator, escrita para quem a lê na tela.
 *
 * Diz o que fazer, e não só que não pode: sem o "peça a um administrador", a
 * pessoa relê o próprio link procurando o erro que não está lá.
 *
 * Um pedido sem sessão nenhuma nem chega às rotas — o middleware devolve 401
 * antes. Por isso as rotas do modo Creator só precisam da recusa por permissão.
 */
export const CREATOR_ONLY_ERROR =
  "O modo Creator é do time de criação. Peça acesso a um administrador em Configurações › Usuários.";
