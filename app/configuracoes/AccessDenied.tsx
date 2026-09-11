import Link from "next/link";
import { ShieldAlert } from "lucide-react";

/**
 * O que alguém sem permissão vê no lugar do painel.
 *
 * Uma tela, e não um redirecionamento silencioso para a home: quem clicou num
 * link de configurações precisa entender que a página existe e que falta
 * permissão — senão a impressão é de que o link está quebrado.
 */
export default function AccessDenied() {
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
      <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.75rem" }}>
        Área restrita a administradores
      </h2>
      <p style={{ color: "var(--muted)", lineHeight: 1.6, fontSize: "0.9rem" }}>
        As configurações globais guardam metas, credenciais das integrações e as chaves dos
        provedores de IA. Peça a um administrador que libere seu acesso em{" "}
        <strong>Configurações › Usuários</strong>.
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
          fontSize: "0.85rem",
          fontWeight: 600,
        }}
      >
        Voltar ao início
      </Link>
    </div>
  );
}
