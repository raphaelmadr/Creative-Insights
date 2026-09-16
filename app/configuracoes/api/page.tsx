import { redirect } from "next/navigation";

/**
 * A antiga página "Integrações (API)".
 *
 * As credenciais dos canais foram para `/configuracoes/sistema`, junto do
 * "Status das Integrações" que já as lia: eram duas telas configurando a mesma
 * infraestrutura, cada uma com o seu carregamento e o seu botão de salvar.
 *
 * A rota fica como redirecionamento, e não apagada, porque ela está em links e
 * favoritos da equipe — e porque as mensagens de erro do sistema apontam para
 * "Configurações › API".
 */
export default function IntegracoesApiPage() {
  redirect("/configuracoes/sistema");
}
