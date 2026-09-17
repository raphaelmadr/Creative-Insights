import Link from "next/link";
import { ShieldAlert } from "lucide-react";

/**
 * O que alguém sem permissão vê no lugar da área.
 *
 * Uma tela, e não um redirecionamento silencioso para a home: quem clicou num
 * link precisa entender que a página existe e que falta permissão — senão a
 * impressão é de que o link está quebrado.
 *
 * Genérica desde que passaram a existir duas áreas restritas: as configurações
 * globais e o modo Creator. Uma cópia por área envelheceria em ritmos
 * diferentes, e a que ninguém revisasse seria a que dá a instrução errada de
 * como pedir acesso.
 */
export default function AccessDenied({
  title,
  children,
}: {
  title: string;
  /** Por que é restrita, e o que fazer para entrar. */
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        maxWidth: "520px",
        margin: "4rem auto",
        padding: "2.5rem",
        textAlign: "center",
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        borderRadius: "16px",
      }}
    >
      <ShieldAlert size={40} color="var(--muted)" style={{ marginBottom: "1rem" }} />
      <h2 style={{ fontSize: "var(--text-metric)", fontWeight: 700, marginBottom: "0.75rem" }}>
        {title}
      </h2>
      <p style={{ color: "var(--muted)", lineHeight: 1.6, fontSize: "var(--text-cardtitle)" }}>
        {children}
      </p>
      <Link
        href="/"
        style={{
          display: "inline-block",
          marginTop: "1.5rem",
          padding: "0.65rem 1.25rem",
          borderRadius: "100px",
          border: "1px solid var(--card-border)",
          color: "var(--foreground)",
          textDecoration: "none",
          fontSize: "var(--text-control)",
          fontWeight: 600,
        }}
      >
        Voltar ao início
      </Link>
    </div>
  );
}
