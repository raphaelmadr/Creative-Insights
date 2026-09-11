"use client";

/**
 * Quem tem acesso ao painel.
 *
 * A lista é de contas que já entraram pelo menos uma vez — não há convite: o
 * acesso continua sendo por e-mail da empresa, e é o primeiro login que cria a
 * conta. O que se decide aqui é o papel de quem já entrou.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, User as UserIcon } from "lucide-react";
import { Avatar } from "@/components/Avatar";

interface ManagedUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: "ADMIN" | "MEMBER";
  lastSeenAt: string | null;
  isOnline: boolean;
  isSelf: boolean;
}

function lastSeenLabel(user: ManagedUser): string {
  if (user.isOnline) return "online agora";
  if (!user.lastSeenAt) return "nunca esteve online";

  return `visto em ${new Date(user.lastSeenAt).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  })}`;
}

export default function UsuariosPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [fetching, setFetching] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      const json = await res.json();
      if (json.success) setUsers(json.data);
      else setError(json.error || "Não foi possível carregar os usuários.");
    } catch {
      setError("Não foi possível carregar os usuários.");
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changeRole = async (user: ManagedUser, role: "ADMIN" | "MEMBER") => {
    setSavingId(user.id);
    setError(null);

    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role }),
      });
      const json = await res.json();

      if (!res.ok) {
        // A recusa mais provável é a trava do último admin, cuja mensagem
        // explica o que fazer — vale mais que um "erro ao salvar".
        setError(json.error || "Não foi possível alterar o acesso.");
        return;
      }

      setUsers((current) =>
        current.map((u) => (u.id === user.id ? { ...u, role: json.data.role } : u))
      );
    } catch {
      setError("Não foi possível alterar o acesso.");
    } finally {
      setSavingId(null);
    }
  };

  const admins = users.filter((u) => u.role === "ADMIN").length;

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.35rem" }}>Usuários e acesso</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.6, maxWidth: "620px" }}>
          Administradores abrem este painel — metas, credenciais das integrações, prompts de IA e
          logs. Membros usam o resto da plataforma normalmente, sem ver nenhuma credencial.
        </p>
      </div>

      {error && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            color: "var(--danger)",
            padding: "0.85rem 1rem",
            borderRadius: "8px",
            marginBottom: "1.25rem",
            fontSize: "0.85rem",
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}

      {fetching ? (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--muted)" }}>
          <Loader2 size={16} className="spin" style={{ animation: "spin 1s linear infinite" }} />
          Carregando usuários...
        </div>
      ) : (
        <>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
            {users.length} {users.length === 1 ? "conta" : "contas"} · {admins}{" "}
            {admins === 1 ? "administrador" : "administradores"}
          </div>

          <div
            style={{
              border: "1px solid var(--card-border)",
              borderRadius: "12px",
              overflow: "hidden",
              background: "var(--card-bg)",
            }}
          >
            {users.map((user, index) => {
              const isAdmin = user.role === "ADMIN";
              const name = user.name || user.email.split("@")[0];

              return (
                <div
                  key={user.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "1rem",
                    borderTop: index === 0 ? "none" : "1px solid var(--card-border)",
                    flexWrap: "wrap",
                  }}
                >
                  <Avatar src={user.image} name={name} size="md" isActive={user.isOnline} />

                  <div style={{ flex: 1, minWidth: "180px" }}>
                    <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                      {name}
                      {user.isSelf && (
                        <span style={{ color: "var(--muted)", fontWeight: 400 }}> (você)</span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{user.email}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--muted)", opacity: 0.8, marginTop: "0.15rem" }}>
                      {lastSeenLabel(user)}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {(["ADMIN", "MEMBER"] as const).map((role) => {
                      const selected = user.role === role;
                      const Icon = role === "ADMIN" ? ShieldCheck : UserIcon;

                      return (
                        <button
                          key={role}
                          onClick={() => !selected && changeRole(user, role)}
                          disabled={selected || savingId === user.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.4rem",
                            padding: "0.45rem 0.8rem",
                            borderRadius: "100px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            cursor: selected || savingId === user.id ? "default" : "pointer",
                            border: `1px solid ${selected ? "var(--primary)" : "var(--card-border)"}`,
                            background: selected ? "rgba(22, 163, 74, 0.12)" : "transparent",
                            color: selected ? "var(--primary)" : "var(--muted)",
                            opacity: savingId === user.id ? 0.5 : 1,
                            transition: "all 0.2s",
                          }}
                        >
                          <Icon size={14} />
                          {role === "ADMIN" ? "Administrador" : "Membro"}
                        </button>
                      );
                    })}
                  </div>

                  {isAdmin && admins === 1 && (
                    <div
                      style={{
                        width: "100%",
                        fontSize: "0.7rem",
                        color: "var(--muted)",
                        opacity: 0.8,
                      }}
                    >
                      Único administrador: promova outra pessoa antes de rebaixar esta conta, ou
                      ninguém conseguirá reabrir o painel.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
