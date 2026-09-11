"use client";

/**
 * Quem está na plataforma agora, no topo da tela.
 *
 * Avatares sobrepostos e não uma lista: o espaço do cabeçalho é fixo e o time
 * inteiro pode estar online ao mesmo tempo. A pilha mostra os primeiros e
 * resume o resto num contador; a lista completa fica a um clique.
 */

import React, { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { usePresence } from "@/hooks/usePresence";
import type { PresenceUser } from "@/lib/presence";

/** Quantos rostos cabem antes do contador — medido no cabeçalho em 1280px. */
const VISIBLE_AVATARS = 4;

function displayName(user: PresenceUser): string {
  return user.name || user.email.split("@")[0];
}

/** "Ana Paula Ribeiro" vira "Ana Paula": o cabeçalho não comporta o nome inteiro. */
function shortName(user: PresenceUser): string {
  return displayName(user).split(" ").slice(0, 2).join(" ");
}

export default function OnlineUsers() {
  const { users, isReady } = usePresence();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const onClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [isOpen]);

  // Antes da primeira resposta não há nada a dizer — uma lista vazia piscando
  // no cabeçalho sugere que ninguém está online, o que não foi verificado.
  if (!isReady || users.length === 0) return null;

  const visible = users.slice(0, VISIBLE_AVATARS);
  const overflow = users.length - visible.length;

  return (
    <div ref={containerRef} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button onClick={() => setIsOpen(!isOpen)} title={`${users.length} ${users.length === 1 ? "pessoa online" : "pessoas online"}`} className="btn btn-ghost" >
        <div style={{ display: "flex", alignItems: "center" }}>
          {visible.map((user, index) => (
            <div
              key={user.id}
              title={displayName(user)}
              style={{
                marginLeft: index === 0 ? 0 : "-10px",
                // O primeiro da pilha fica por cima do seguinte, e assim por diante.
                zIndex: VISIBLE_AVATARS - index,
                borderRadius: "50%",
                // O anel na cor do cabeçalho é o que separa um rosto do outro.
                boxShadow: "0 0 0 2px var(--background-main)",
                display: "flex",
              }}
            >
              <Avatar src={user.image} name={displayName(user)} size="sm" isActive={false} />
            </div>
          ))}

          {overflow > 0 && (
            <div
              style={{
                marginLeft: "-10px",
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                boxShadow: "0 0 0 2px var(--background-main)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "var(--text-caption)",
                fontWeight: 700,
                color: "var(--muted)",
              }}
            >
              +{overflow}
            </div>
          )}
        </div>

        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            fontSize: "var(--text-caption)",
            color: "var(--muted)",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "var(--primary)",
              display: "inline-block",
            }}
          />
          {users.length} online
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 0.75rem)",
            right: 0,
            width: "260px",
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: "12px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            overflow: "hidden",
            zIndex: 200,
          }}
        >
          <div
            style={{
              padding: "0.75rem 1rem",
              borderBottom: "1px solid var(--card-border)",
              fontSize: "var(--text-control)",
              fontWeight: 600,
            }}
          >
            Online agora
          </div>

          <div style={{ maxHeight: "300px", overflowY: "auto" }}>
            {users.map((user) => (
              <div
                key={user.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.65rem",
                  padding: "0.65rem 1rem",
                  borderBottom: "1px solid var(--card-border)",
                }}
              >
                <Avatar src={user.image} name={displayName(user)} size="sm" />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: "var(--text-control)",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {shortName(user)}
                    {user.isSelf && (
                      <span style={{ color: "var(--muted)", fontWeight: 400 }}> (você)</span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: "var(--text-caption)",
                      color: "var(--muted)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {user.email}
                  </div>
                </div>
                {user.role === "ADMIN" && (
                  <span
                    style={{
                      fontSize: "var(--text-eyebrow)",
                      fontWeight: 700,
                      letterSpacing: "0.03em",
                      color: "var(--primary)",
                      background: "rgba(22, 163, 74, 0.12)",
                      padding: "0.15rem 0.4rem",
                      borderRadius: "6px",
                    }}
                  >
                    ADMIN
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
