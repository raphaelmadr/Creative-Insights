import { redirect } from "next/navigation";

/**
 * A raiz do módulo não tem tela própria: o Kanban é a porta de entrada.
 *
 * O alternador do topo já aponta direto para `/creator/kanban`, mas quem chega
 * por link colado ou pelo histórico do navegador cairia numa rota inexistente.
 */
export default function CreatorIndex() {
  redirect("/creator/kanban");
}
