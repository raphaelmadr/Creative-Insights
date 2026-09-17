"use client";

/**
 * Quem tem acesso ao painel.
 *
 * A lista é de contas que já entraram pelo menos uma vez — não há convite: o
 * acesso continua sendo por e-mail da empresa, e é o primeiro login que cria a
 * conta. O que se decide aqui é o papel de quem já entrou.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, PenTool, ShieldCheck, User as UserIcon } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { ROLE_DESCRIPTION, ROLE_LABEL, USER_ROLES, type UserRole } from "@/lib/roles";

/** O ícone de cada degrau — o mesmo do módulo que ele abre. */
const ROLE_ICON = {
  ADMIN: ShieldCheck,
  CREATOR: PenTool,
  MEMBER: UserIcon,
} as const;

interface ManagedUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: UserRole;
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

  const changeRole = async (user: ManagedUser, role: UserRole) => {
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
  const criadores = users.filter((u) => u.role === "CREATOR").length;

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "var(--text-metric-lg)", fontWeight: 700, marginBottom: "0.35rem" }}>Usuários e acesso</h2>
        <p style={{ color: "var(--muted)", fontSize: "var(--text-cardtitle)", lineHeight: 1.6, maxWidth: "620px" }}>
          O acesso é uma escada de três degraus, e cada um alcança tudo o que está abaixo.
        </p>

        {/*
          A lista explica os degraus uma vez, aqui, em vez de repetir a
          explicação em cada linha da tabela: quem decide o papel de alguém lê
          isto antes de clicar, e depois só escolhe.
        */}
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "1rem 0 0",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            maxWidth: "620px",
          }}
        >
          {USER_ROLES.map((role) => {
            const Icon = ROLE_ICON[role];
            return (
              <li
                key={role}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.6rem",
                  fontSize: "var(--text-caption)",
                  color: "var(--muted)",
                  lineHeight: 1.5,
                }}
              >
                <Icon size={15} color="var(--primary)" style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                <span>
                  <strong style={{ color: "var(--foreground)" }}>{ROLE_LABEL[role]}</strong> ·{" "}
                  {ROLE_DESCRIPTION[role]}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {error && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            color: "var(--danger)",
            padding: "0.85rem 1rem",
            borderRadius: "8px",
            marginBottom: "1.25rem",
            fontSize: "var(--text-control)",
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
          <div style={{ fontSize: "var(--text-caption)", color: "var(--muted)", marginBottom: "0.75rem" }}>
            {users.length} {users.length === 1 ? "conta" : "contas"} · {admins}{" "}
            {admins === 1 ? "administrador" : "administradores"} · {criadores}{" "}
            {criadores === 1 ? "creator" : "creators"}
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
                    <div style={{ fontSize: "var(--text-cardtitle)", fontWeight: 600 }}>
                      {name}
                      {user.isSelf && (
                        <span style={{ color: "var(--muted)", fontWeight: 400 }}> (você)</span>
                      )}
                    </div>
                    <div style={{ fontSize: "var(--text-caption)", color: "var(--muted)" }}>{user.email}</div>
                    <div style={{ fontSize: "var(--text-caption)", color: "var(--muted)", opacity: 0.8, marginTop: "0.15rem" }}>
                      {lastSeenLabel(user)}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {USER_ROLES.map((role) => {
                      const selected = user.role === role;
                      const Icon = ROLE_ICON[role];

                      return (
                        <button key={role} onClick={() => !selected && changeRole(user, role)} disabled={selected || savingId === user.id} aria-pressed={selected} className="btn btn-toggle" title={ROLE_DESCRIPTION[role]} >
                          <Icon size={14} />
                          {ROLE_LABEL[role]}
                        </button>
                      );
                    })}
                  </div>

                  {isAdmin && admins === 1 && (
                    <div
                      style={{
                        width: "100%",
                        fontSize: "var(--text-caption)",
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
