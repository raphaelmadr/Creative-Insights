/**
 * A conta de desenvolvimento — e por que ela precisa ser invisível em produção.
 *
 * O atalho de login local grava um usuário no banco, porque papel, presença e
 * preferências são lidos da tabela `User`: sem linha, o painel local ficaria
 * trancado para quem está justamente desenvolvendo-o.
 *
 * O banco é UM SÓ, e isso é decisão do projeto, não descuido: os criativos e as
 * métricas custaram milhares de chamadas às APIs do Meta e do TikTok, sob
 * limites de taxa apertados, e manter uma segunda base significaria ou
 * ressincronizar tudo, ou conviver com duas verdades divergindo. Não separe.
 *
 * A consequência é que a linha criada na máquina de alguém aparece no sistema
 * no ar: ela entrava na lista de usuários, contava como administrador e chegou
 * a sustentar sozinha a trava do último admin — um administrador que ninguém
 * consegue usar, já que o provedor de atalho não é registrado fora de
 * desenvolvimento. Este módulo é a resposta a isso: a conta é filtrada de tudo
 * que é visível ou contável em produção, e segue normal na máquina local.
 */

export const DEV_USER_EMAIL = "dev@allugator.com";

/** Em desenvolvimento a conta é legítima: é com ela que se está trabalhando. */
export const isDevEnvironment = (): boolean => process.env.NODE_ENV === "development";

export function isDevUser(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === DEV_USER_EMAIL;
}

/**
 * Se esta conta deve ser escondida no contexto atual.
 *
 * `true` apenas fora de desenvolvimento: localmente a pessoa precisa se ver na
 * lista de quem está online e na tela de acesso.
 */
export function shouldHideUser(email: string | null | undefined): boolean {
  return isDevUser(email) && !isDevEnvironment();
}

/**
 * Filtro do Prisma que exclui a conta de desenvolvimento das consultas de
 * usuário feitas em produção. Em desenvolvimento não filtra nada.
 */
export function excludeDevUserWhere(): { email?: { not: string } } {
  return isDevEnvironment() ? {} : { email: { not: DEV_USER_EMAIL } };
}
