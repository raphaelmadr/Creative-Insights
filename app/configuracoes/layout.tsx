import React from "react";
import TopBar from "@/components/TopBar";
import ConfigSidebar from "./ConfigSidebar";
import AccessDenied from "./AccessDenied";
import { getCurrentAdmin } from "@/lib/auth";
import { Settings } from "lucide-react";

/*
 * A permissão é verificada aqui, no servidor, e não no middleware: o middleware
 * roda no edge, sem acesso ao banco, e o papel precisa vir do banco a cada
 * visita. Carimbá-lo no token faria uma promoção — ou uma remoção de acesso —
 * só valer no login seguinte.
 */
export default async function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin();
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar />
      {/* `config-shell` desliga as animações dos cartões nesta área — ver globals.css. */}
      <div className="dashboard-container config-shell" style={{ flexDirection: "column" }}>
        
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "var(--text-page)", fontWeight: 800, marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }} className="lowercase-title">
            <Settings size={32} color="var(--primary)" />
            configurações globais<span className="dot-green">.</span>
          </h1>
          <p style={{ color: "var(--muted)", maxWidth: "600px", lineHeight: 1.6 }} className="lowercase-title">
            Central de controle de metas, regras de negócio e infraestrutura do sistema.
          </p>
        </div>

        {admin ? (
          <div style={{ display: "flex", alignItems: "flex-start", gap: "2rem", width: "100%" }}>
            <ConfigSidebar />

            <div style={{ flex: 1, minWidth: 0, paddingBottom: "4rem" }}>
              {children}
            </div>
          </div>
        ) : (
          <AccessDenied />
        )}

      </div>
    </main>
  );
}
