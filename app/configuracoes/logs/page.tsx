"use client";

import React, { useState, useEffect } from "react";
import { Loader2, Trash2 } from "lucide-react";

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
    <div className="glass-panel" style={{ padding: "2rem", borderRadius: "16px", minHeight: "60vh", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Logs do Sistema</h3>
        <button type="button" onClick={clearLogs} style={{ background: "rgba(239, 68, 68, 0.1)", border: "none", color: "var(--danger, #ef4444)", padding: "0.6rem 1.2rem", borderRadius: "8px", cursor: "pointer", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600 }}>
          <Trash2 size={16} /> Limpar Logs
        </button>
      </div>

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
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--muted)", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 700, color: "var(--foreground)" }}>[{log.source}] {log.level}</span>
                <span>{new Date(log.createdAt).toLocaleString()}</span>
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 500, color: "var(--foreground)", lineHeight: 1.5 }}>
                {log.message}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
