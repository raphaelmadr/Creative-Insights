/**
 * Mudança de papel de usuário — e a regra que protege o acesso ao painel.
 *
 * Enquanto houver **um único administrador**, ele não pode perder o acesso.
 * Sem essa trava o sistema tranca a si mesmo: rebaixado o último admin, não
 * sobra ninguém com permissão para promover alguém de volta, e a única saída
 * seria alterar o banco à mão.
 *
 * A regra vive aqui, e não dentro da rota, porque vale para qualquer caminho
 * que possa tirar o acesso de alguém — hoje o rebaixamento, amanhã uma exclusão
 * de conta. Duas cópias dessa verificação divergem, e a que esquecerem de
 * atualizar é a que tranca o painel.
 */

import prisma from "./prisma";
import { DEV_USER_EMAIL, isDevEnvironment } from "./dev-user";

export type UserRole = "ADMIN" | "MEMBER";

export const USER_ROLES: UserRole[] = ["ADMIN", "MEMBER"];

export const LAST_ADMIN_MESSAGE =
  "Este é o único administrador. Promova outra pessoa antes de remover o acesso deste usuário — " +
  "sem nenhum admin, ninguém consegue reabrir o painel de configurações.";

export interface RoleChangeUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
}

export type RoleChangeResult =
  | { ok: true; previousRole: string; user: RoleChangeUser }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "last-admin" };

export function isValidRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as string[]).includes(value);
}

/**
 * Quantos administradores existem além deste usuário.
 *
 * Em produção a conta de desenvolvimento não entra na conta: ninguém consegue
 * entrar com ela fora da máquina local, então deixá-la sustentar a regra
 * significaria dar o painel por protegido enquanto, no ar, não sobrou nenhum
 * administrador utilizável. Foi exatamente o estado em que o sistema ficou.
 */
export async function countOtherAdmins(userId: string): Promise<number> {
  return prisma.user.count({
    where: {
      role: "ADMIN",
      NOT: { id: userId },
      ...(isDevEnvironment() ? {} : { email: { not: DEV_USER_EMAIL } }),
    },
  });
}

/**
 * Aplica o novo papel, respeitando a trava do último administrador.
 *
 * O rebaixamento é uma única instrução condicional no banco, e não uma contagem
 * seguida de uma escrita. A diferença importa: contar e gravar em passos
 * separados deixa uma janela em que dois pedidos simultâneos leem "ainda há
 * outro admin", os dois passam, e a conta de administradores chega a zero —
 * exatamente o estado que a regra existe para impedir. Aqui a própria condição
 * é avaliada no momento da escrita, então o segundo pedido não altera nada e é
 * recusado.
 */
export async function changeUserRole(
  userId: string,
  role: UserRole
): Promise<RoleChangeResult> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!target) return { ok: false, reason: "not-found" };

  const isDemotion = target.role === "ADMIN" && role === "MEMBER";

  if (isDemotion) {
    /*
     * O outro administrador tem que ser utilizável: em produção a conta de
     * desenvolvimento é descartada da contagem, porque o provedor de atalho não
     * existe fora da máquina local.
     */
    const devEmailFilter = isDevEnvironment() ? "" : DEV_USER_EMAIL;

    const affected = await prisma.$executeRaw`
      UPDATE \`User\`
         SET \`role\` = 'MEMBER'
       WHERE \`id\` = ${userId}
         AND \`role\` = 'ADMIN'
         AND (
           SELECT \`c\` FROM (
             SELECT COUNT(*) AS \`c\` FROM \`User\`
              WHERE \`role\` = 'ADMIN'
                AND \`id\` <> ${userId}
                AND (\`email\` IS NULL OR \`email\` <> ${devEmailFilter})
           ) AS \`others\`
         ) > 0
    `;

    // Nenhuma linha alterada: outro pedido chegou antes e este virou o último.
    if (affected === 0) return { ok: false, reason: "last-admin" };
  } else {
    await prisma.user.update({ where: { id: userId }, data: { role } });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, image: true, role: true },
  });

  return { ok: true, previousRole: target.role, user: user! };
}
