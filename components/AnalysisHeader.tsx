"use client";

import React, { useState } from "react";
import { Sparkles, Edit2, CheckCircle2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AnalysisHeader({ 
  analysis 
}: { 
  analysis: { id: string; title: string | null; resolved: boolean; createdAt: Date } 
}) {
  const [title, setTitle] = useState(analysis.title || "");
  const [isEditing, setIsEditing] = useState(false);
  const [resolved, setResolved] = useState(analysis.resolved);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const defaultTitle = `Análise de ${new Date(analysis.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;

  const handleSaveTitle = async () => {
    setIsEditing(false);
    
    // Normalize empty strings to null
    const finalTitle = title.trim() === "" ? null : title;
    
    if (finalTitle === analysis.title) return;
    
    setLoading(true);
    try {
      await fetch(`/api/analises/${analysis.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: finalTitle }),
      });
      router.refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleResolved = async () => {
    const newVal = !resolved;
    setResolved(newVal);
    setLoading(true);
    try {
      await fetch(`/api/analises/${analysis.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: newVal }),
      });
      router.refresh();
    } catch (e) {
      console.error(e);
      setResolved(!newVal); // revert on error
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Sparkles size={28} color="var(--primary)" />
          
          {isEditing ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveTitle();
                if (e.key === "Escape") {
                  setTitle(analysis.title || "");
                  setIsEditing(false);
                }
              }}
              placeholder={defaultTitle}
              style={{
                fontSize: "2rem",
                fontWeight: 800,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "var(--foreground)",
                borderRadius: "0.5rem",
                padding: "0.25rem 0.5rem",
                outline: "none",
                width: "400px"
              }}
            />
          ) : (
            <h1 
              onClick={() => setIsEditing(true)}
              style={{ fontSize: "2rem", cursor: "text", display: "flex", alignItems: "center", gap: "0.5rem" }} 
              className="gradient-text hover-glow"
              title="Clique para editar o nome"
            >
              {title || defaultTitle}
              <Edit2 size={16} style={{ opacity: 0.3 }} />
            </h1>
          )}
        </div>
        <p style={{ opacity: 0.7, marginTop: "0.5rem" }}>
          Gerada em {new Date(analysis.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      <button
        onClick={toggleResolved}
        disabled={loading}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.75rem 1.25rem",
          borderRadius: "100px",
          border: resolved ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(255,255,255,0.2)",
          background: resolved ? "rgba(16, 185, 129, 0.1)" : "rgba(255,255,255,0.03)",
          color: resolved ? "#10b981" : "var(--foreground)",
          cursor: "pointer",
          fontWeight: 600,
          transition: "all 0.2s"
        }}
        className="hover-glow"
      >
        {resolved ? (
          <>
            <CheckCircle2 size={20} />
            Resolvida
          </>
        ) : (
          <>
            <XCircle size={20} opacity={0.5} />
            Marcar como Resolvida
          </>
        )}
      </button>
    </div>
  );
}
