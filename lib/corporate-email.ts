/**
 * Quem é "da casa", em um lugar só.
 *
 * A regra já existia dentro de `lib/auth.ts`, decidindo quem consegue entrar
 * pelo Google. O link público de demandas precisa da MESMA regra — e `auth.ts`
 * puxa NextAuth e Prisma, então não pode ser importado por uma página de
 * cliente. Módulo puro, como `lib/acronyms.ts` e `lib/copy-options.ts`: o
 * formulário valida enquanto a pessoa digita e o servidor valida de novo ao
 * gravar, os dois lendo a mesma linha.
 *
 * Validar no cliente é conveniência, nunca proteção: quem manda a requisição
 * direto não passa por lá. É por isso que o servidor repete a checagem.
 */

/** Só e-mails da empresa entram — a regra já valia e continua valendo. */
export const ALLOWED_EMAIL_DOMAIN = "@allugator.com";

/**
 * O e-mail é da empresa?
 *
 * Aceita espaço em volta e maiúsculas porque quem cola um e-mail de outro lugar
 * traz as duas coisas, e recusar por isso seria recusar o endereço certo.
 */
export function isCorporateEmail(value: unknown): boolean {
  return typeof value === "string" && normalizeCorporateEmail(value).endsWith(ALLOWED_EMAIL_DOMAIN);
}

/** O e-mail como ele deve ser guardado: sem espaços, em minúsculas. */
export function normalizeCorporateEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** A recusa, escrita para quem está olhando o formulário. */
export const CORPORATE_EMAIL_ERROR = `Use seu e-mail corporativo, terminado em ${ALLOWED_EMAIL_DOMAIN}.`;
