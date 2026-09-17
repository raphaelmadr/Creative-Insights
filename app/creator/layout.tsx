import React from "react";
import TopBar from "@/components/TopBar";
import AccessDenied from "@/components/AccessDenied";
import { getCurrentCreator } from "@/lib/auth";

/**
 * A casca do módulo Creator — e a porta dele.
 *
 * O board e o gerador de copy são de quem produz. Pedir uma peça não é: quem
 * precisa de um banner quase nunca é quem vai desenhá-lo, e por isso a abertura
 * de demanda saiu daqui para `/api/demanda`, alcançável de qualquer tela pela
 * barra do topo.
 *
 * A permissão é conferida aqui, no servidor, e não no middleware: o middleware
 * roda no edge, sem acesso ao banco, e o papel precisa vir do banco a cada
 * visita. Carimbá-lo no token faria uma liberação — ou uma retirada de acesso —
 * só valer no login seguinte. É a mesma decisão de `app/configuracoes`.
 *
 * Esconder o botão na barra do topo não é proteção nenhuma: quem colar
 * `/creator/kanban` na barra de endereço chega aqui do mesmo jeito. Esta é a
 * verificação que vale, e as rotas de `/api/creator` repetem cada uma a sua —
 * uma tela barrada com a API aberta continua sendo uma API aberta.
 */
export const dynamic = "force-dynamic";

export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  const creator = await getCurrentCreator();

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar />
      {creator ? (
        children
      ) : (
        <AccessDenied title="Modo Creator restrito">
          O board criativo e o gerador de copy são do time de criação. Abrir demanda
          continua com você: use <strong>Nova demanda</strong> na barra do topo, de
          qualquer tela. Para produzir, peça a um administrador que libere seu acesso em{" "}
          <strong>Configurações › Usuários</strong>.
        </AccessDenied>
      )}
    </main>
  );
}
