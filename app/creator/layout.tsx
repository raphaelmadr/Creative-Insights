import React from "react";
import TopBar from "@/components/TopBar";

/**
 * A casca do módulo Creator.
 *
 * Existe para a barra do topo ser montada uma vez só, como em
 * `app/configuracoes`. Não repete a verificação de acesso do painel de
 * configurações: abrir demanda é para qualquer pessoa autenticada da empresa —
 * quem pede a peça quase nunca é quem administra a plataforma —, e a
 * autenticação em si já é garantida pelo middleware.
 */
export default function CreatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar />
      {children}
    </main>
  );
}
