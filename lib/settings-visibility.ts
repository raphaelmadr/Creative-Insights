/**
 * O que cada pessoa pode ver de `SystemSettings`.
 *
 * O registro guarda, na mesma linha, metas de performance e todas as
 * credenciais do sistema — tokens do Meta e do TikTok, segredo do Google, chave
 * de cada provedor de IA, segredo do cPanel, `nextAuthSecret`. A rota devolvia
 * a linha inteira para qualquer pessoa autenticada, e a interface comum usa
 * essa resposta: sem este corte, restringir a tela de configurações não
 * restringiria nada, bastaria abrir `/api/settings` no navegador.
 *
 * A lista é de campos permitidos, e não de campos proibidos, porque o registro
 * cresce: uma credencial nova adicionada ao schema entra automaticamente como
 * secreta, em vez de vazar até alguém lembrar de escondê-la.
 */

/**
 * Campos que qualquer pessoa autenticada pode ler.
 *
 * São os que a interface fora do painel realmente consome — o cabeçalho mostra
 * quais canais estão conectados, e o aviso de sincronização precisa saber
 * quando foi a última e como o agendamento está configurado — mais os números
 * de meta, que são o critério de leitura dos cartões e não segredo de acesso.
 */
const PUBLIC_SETTINGS_FIELDS = [
  "id",
  "teamCreativeGoal",
  "superWinnerSpend",
  "superWinnerReturn",
  "superWinnerCpa",
  "winnerSpend",
  "winnerReturn",
  "winnerCpa",
  "creativeCategories",
  "cronSyncEnabled",
  "cronSyncInterval",
  "lastSyncAt",
  "lastCronSyncAt",
  "updatedAt",
] as const;

export type PublicSettings = Record<string, unknown>;

/**
 * A versão da configuração que pode ir para quem não é admin.
 *
 * O estado das integrações não sai daqui: ele já viaja em `integrations`, como
 * booleanos — é o que o cabeçalho precisa para acender os ícones, sem que o
 * token em si saia do servidor.
 */
export function toPublicSettings(settings: Record<string, unknown>): PublicSettings {
  const visible: PublicSettings = {};

  for (const field of PUBLIC_SETTINGS_FIELDS) {
    if (field in settings) visible[field] = settings[field];
  }

  return visible;
}
