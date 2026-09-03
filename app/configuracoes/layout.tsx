import React from "react";
import TopBar from "@/components/TopBar";
import ConfigSidebar from "./ConfigSidebar";
import { Settings } from "lucide-react";

export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar />
      <div className="dashboard-container" style={{ flexDirection: "column" }}>
        
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "2.5rem", fontWeight: 800, marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }} className="lowercase-title">
            <Settings size={32} color="var(--primary)" />
            configurações globais<span className="dot-green">.</span>
          </h1>
          <p style={{ color: "var(--muted)", maxWidth: "600px", lineHeight: 1.6 }} className="lowercase-title">
            Central de controle de metas, regras de negócio e infraestrutura do sistema.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: "2rem", width: "100%" }}>
          <ConfigSidebar />
          
          <div style={{ flex: 1, minWidth: 0, paddingBottom: "4rem" }}>
            {children}
          </div>
        </div>

      </div>
    </main>
  );
}
