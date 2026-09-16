"use client";

import React, { useState, useEffect } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { SettingsSection } from "@/components/SettingsUI";

export default function LogsPage() {
  const [sysLogs, setSysLogs] = useState<any[]>([]);
  const [fetchingLogs, setFetchingLogs] = useState(false);

  const fetchLogs = async () => {
    setFetchingLogs(true);
    try {
      const res = await fetch("/api/logs");
      const json = await res.json();
      if (Array.isArray(json)) setSysLogs(json);
    } catch (err) {
      console.error(err);
    }
    setFetchingLogs(false);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const clearLogs = async () => {
    if (!confirm("Tem certeza que deseja apagar todos os logs?")) return;
    try {
      await fetch("/api/logs", { method: "DELETE" });
      setSysLogs([]);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <SettingsSection
      title="Logs do sistema"
      description="Falhas em dependências externas — chave de IA recusada, cota esgotada, token do Meta expirado, upload rejeitado pelo cPanel — chegam aqui com o motivo e a correção. Vermelho pede ação de configuração; amarelo passa sozinho na próxima execução."
      action={
        <button type="button" onClick={clearLogs} className="btn btn-danger" style={{ color: "var(--danger, #ef4444)" }} >
          <Trash2 size={15} /> Limpar logs
        </button>
      }
    >

      {fetchingLogs ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}>
          <Loader2 size={32} className="spin mx-auto" color="var(--primary)" />
        </div>
      ) : sysLogs.length === 0 ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1, color: "var(--muted)", border: "1px dashed var(--card-border)", borderRadius: "12px", minHeight: "200px" }}>
          Nenhum log registrado no sistema.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", overflowY: "auto", paddingRight: "0.5rem" }}>
          {sysLogs.map((log: any) => (
            <div key={log.id} style={{ padding: "1.2rem", borderRadius: "12px", background: "var(--background-main)", borderLeft: `4px solid ${log.level === 'ERROR' ? '#ef4444' : log.level === 'WARNING' ? '#f59e0b' : '#3b82f6'}`, boxShadow: "var(--card-shadow)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-control)", color: "var(--muted)", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 700, color: "var(--foreground)" }}>[{log.source}] {log.level}</span>
                <span>{new Date(log.createdAt).toLocaleString()}</span>
              </div>
              <LogMessage message={log.message} />

              {log.stack && (
                <details style={{ marginTop: "0.6rem" }}>
                  <summary style={{ cursor: "pointer", fontSize: "var(--text-caption)", color: "var(--muted)" }}>
                    Rastreamento técnico
                  </summary>
                  <pre style={{ margin: "0.5rem 0 0", padding: "0.6rem", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "8px", fontSize: "var(--text-caption)", lineHeight: 1.45, overflowX: "auto", whiteSpace: "pre" }}>
                    {log.stack}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}

/**
 * A mensagem do log, com a correção em destaque.
 *
 * As mensagens de falha externa vêm em linhas — o que falhou, o que fazer, o
 * que o provedor respondeu. Sem `pre-wrap` o navegador colapsava tudo num
 * parágrafo só, e a linha "CORRIGIR" — a única que pede ação de alguém — ficava
 * no meio do texto, indistinguível do relato.
 */
function LogMessage({ message }: { message: string }) {
  const lines = (message || "").split("\n");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "var(--text-cardtitle)", color: "var(--foreground)", lineHeight: 1.5 }}>
      {lines.map((line, i) => {
        const isFix = /^CORRIGIR:/i.test(line.trim());
        const isProviderEcho = /^(Provedor respondeu|Endpoint|Contexto):/i.test(line.trim());

        if (isFix) {
          return (
            <p
              key={i}
              style={{
                margin: 0, padding: "0.5rem 0.7rem",
                borderLeft: "3px solid var(--primary)", background: "var(--primary-glow)",
                borderRadius: "0 6px 6px 0", fontWeight: 600, whiteSpace: "pre-wrap"
              }}
            >
              {line}
            </p>
          );
        }

        return (
          <p
            key={i}
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              opacity: isProviderEcho ? 0.7 : 1,
              fontSize: isProviderEcho ? "0.82rem" : undefined,
              fontFamily: isProviderEcho ? "monospace" : undefined,
            }}
          >
            {line}
          </p>
        );
      })}
    </div>
  );
}
