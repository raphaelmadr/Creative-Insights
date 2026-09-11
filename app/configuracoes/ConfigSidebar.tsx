"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Target, 
  Users, 
  Settings2, 
  BrainCircuit, 
  TerminalSquare,
  ShieldCheck
} from "lucide-react";

const navItems = [
  { name: "Metas & KPIs", href: "/configuracoes/metas", icon: Target },
  { name: "Equipe", href: "/configuracoes/equipe", icon: Users },
  // Equipe são os criadores das peças; Usuários são as contas que entram no
  // sistema. São listas diferentes e não devem virar uma só tela.
  { name: "Usuários & Acesso", href: "/configuracoes/usuarios", icon: ShieldCheck },
  // Sistema e Integrações eram duas entradas para a mesma infraestrutura.
  { name: "Sistema & Integrações", href: "/configuracoes/sistema", icon: Settings2 },
  { name: "Inteligência Artificial", href: "/configuracoes/ia", icon: BrainCircuit },
  { name: "Logs", href: "/configuracoes/logs", icon: TerminalSquare },
];

export default function ConfigSidebar() {
  const pathname = usePathname();

  return (
    <aside style={{
      width: "260px",
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem",
      paddingRight: "1.5rem",
      borderRight: "1px solid var(--card-border)",
      flexShrink: 0
    }}>
      {navItems.map(item => {
        const Icon = item.icon;
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              padding: "0.75rem 1rem",
              borderRadius: "8px",
              textDecoration: "none",
              color: isActive ? "var(--primary)" : "var(--muted)",
              background: isActive ? "rgba(22, 163, 74, 0.1)" : "transparent",
              fontWeight: isActive ? 600 : 500,
              transition: "all 0.2s ease"
            }}
          >
            <Icon size={18} />
            {item.name}
          </Link>
        );
      })}
    </aside>
  );
}
