"use client";

/**
 * A própria pessoa, no canto do cabeçalho: quem está logado, com que permissão,
 * e a saída.
 *
 * Antes não havia nenhum dos três. Não dava para saber com qual conta a aba
 * estava aberta — o que importa num painel que agora guarda preferências por
 * pessoa — e não havia como sair sem limpar os cookies à mão.
 */

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { LogOut, Moon, Settings, Sun } from "lucide-react";
import { Avatar } from "./Avatar";
import { useTheme } from "./ThemeProvider";

export default function UserMenu() {
  const { data: session, status } = useSession();
  const { theme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const onClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [isOpen]);

  if (status !== "authenticated" || !session?.user) return null;

  const user = session.user;
  const name = user.name || user.email?.split("@")[0] || "Usuário";
  const isAdmin = user.role === "ADMIN";

  const itemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.65rem",
    width: "100%",
    padding: "0.7rem 1rem",
    background: "transparent",
    border: "none",
    color: "var(--foreground)",
    fontSize: "0.85rem",
    fontWeight: 500,
    textAlign: "left",
    textDecoration: "none",
    cursor: "pointer",
    transition: "background 0.2s",
  };

  const hoverOn = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
  };
  const hoverOff = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = "transparent";
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title={name}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        style={{
          display: "flex",
          alignItems: "center",
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          borderRadius: "50%",
        }}
      >
        <Avatar src={user.image} name={name} size="sm" isActive={false} />
      </button>

      {isOpen && (
        <div
          role="menu"
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
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              padding: "1rem",
              borderBottom: "1px solid var(--card-border)",
            }}
          >
            <Avatar src={user.image} name={name} size="md" isActive={false} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {name}
              </div>
              <div
                style={{
                  fontSize: "0.7rem",
                  color: "var(--muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user.email}
              </div>
              <span
                style={{
                  display: "inline-block",
                  marginTop: "0.35rem",
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                  color: isAdmin ? "var(--primary)" : "var(--muted)",
                  background: isAdmin ? "rgba(22, 163, 74, 0.12)" : "rgba(128,128,128,0.12)",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "6px",
                }}
              >
                {isAdmin ? "ADMINISTRADOR" : "MEMBRO"}
              </span>
            </div>
          </div>

          <button style={itemStyle} onClick={toggleTheme} onMouseOver={hoverOn} onMouseOut={hoverOff}>
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
            Tema {theme === "light" ? "escuro" : "claro"}
          </button>

          {/* Sem permissão o link só levaria a uma tela de acesso negado. */}
          {isAdmin && (
            <Link
              href="/configuracoes"
              style={itemStyle}
              onClick={() => setIsOpen(false)}
              onMouseOver={hoverOn}
              onMouseOut={hoverOff}
            >
              <Settings size={16} />
              Configurações
            </Link>
          )}

          <button
            style={{ ...itemStyle, color: "var(--danger)", borderTop: "1px solid var(--card-border)" }}
            onClick={() => signOut({ callbackUrl: "/login" })}
            onMouseOver={hoverOn}
            onMouseOut={hoverOff}
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
