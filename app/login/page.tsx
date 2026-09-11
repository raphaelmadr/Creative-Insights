"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";

interface AuthConfigCheck {
  redirectUri: string | null;
  baseUrl: string | null;
  sourceLabel: string | null;
  googleClientId: string | null;
  problems: string[];
  howToFix: string[];
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * O erro `redirect_uri_mismatch` acontece do lado do Google: a pessoa nunca
   * volta para cá, então não adianta esperar por um parâmetro de erro na URL.
   * O diagnóstico fica disponível ANTES da tentativa, e diz qual endereço este
   * ambiente vai enviar — que é exatamente o que precisa estar autorizado lá.
   */
  const [config, setConfig] = useState<AuthConfigCheck | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadConfig = async () => {
    if (config || configLoading) return;
    setConfigLoading(true);
    try {
      const res = await fetch("/api/auth/config-check");
      const json = await res.json();
      if (json.success) setConfig(json);
    } catch {
      // Sem diagnóstico: a tela continua utilizável para quem só quer entrar.
    } finally {
      setConfigLoading(false);
    }
  };

  const copyRedirectUri = async () => {
    if (!config?.redirectUri) return;
    try {
      await navigator.clipboard.writeText(config.redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setError(params.get("error"));
    }
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--background-main)",
      padding: "1rem"
    }}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "16px",
          padding: "3rem",
          maxWidth: "420px",
          width: "100%",
          boxShadow: "var(--card-shadow)",
          textAlign: "center"
        }}
      >
        <div style={{ marginBottom: "2rem" }}>
          <img src="/logo.png" alt="allu.mkt creative insights" style={{ height: "40px", margin: "0 auto 1.5rem" }} />
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>Bem-vindo ao Insights</h1>
          <p style={{ color: "var(--muted)", fontSize: "0.95rem" }}>
            Faça login com seu e-mail corporativo para acessar o painel de performance de criativos.
          </p>
        </div>

        {error === "AccessDenied" && (
          <div style={{
            background: "rgba(239, 68, 68, 0.1)",
            color: "var(--danger)",
            padding: "0.8rem",
            borderRadius: "8px",
            marginBottom: "1.5rem",
            fontSize: "0.9rem",
            fontWeight: 500
          }}>
            Acesso negado. Apenas e-mails @allugator.com são autorizados.
          </div>
        )}

        {success ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              background: "rgba(39, 174, 96, 0.1)",
              color: "var(--success)",
              padding: "1.5rem",
              borderRadius: "8px",
              fontWeight: 500
            }}
          >
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>✉️</div>
            Enviamos um link mágico para o seu e-mail.<br/>
            <span style={{ fontSize: "0.85rem", opacity: 0.9 }}>Clique no link para entrar.</span>
          </motion.div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <button
              onClick={() => {
                setLoading(true);
                signIn("google", { callbackUrl: "/" });
              }}
              disabled={loading}
              style={{
                background: "#ffffff",
                color: "#111827",
                padding: "0.8rem",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "1rem",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                transition: "all 0.2s",
                border: "1px solid #D1D5DB",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.75rem",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
              }}
            >
              {loading ? (
                <span style={{ display: "inline-block", width: "16px", height: "16px", border: "2px solid #111827", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Entrar com Google
                </>
              )}
            </button>
            
            {process.env.NODE_ENV === 'development' && (
              <button
                onClick={() => {
                  setLoading(true);
                  signIn("credentials", { callbackUrl: "/" });
                }}
                disabled={loading}
                style={{
                  background: "#111827",
                  color: "#ffffff",
                  padding: "0.8rem",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "1rem",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  transition: "all 0.2s",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.75rem",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.1)"
                }}
              >
                {loading ? (
                  <span style={{ display: "inline-block", width: "16px", height: "16px", border: "2px solid #ffffff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                ) : (
                  "Bypass Login (Dev Only)"
                )}
              </button>
            )}
          </div>
        )}
        
        {/* Diagnóstico de configuração — para quando o Google recusa o login. */}
        <details
          onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) loadConfig(); }}
          style={{ marginTop: "1.5rem", textAlign: "left" }}
        >
          <summary style={{ cursor: "pointer", fontSize: "0.8rem", color: "var(--muted)", textAlign: "center", listStyle: "none" }}>
            Problemas para entrar?
          </summary>

          <div style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.6 }}>
            {configLoading && <p style={{ margin: 0 }}>Verificando a configuração...</p>}

            {config && (
              <>
                <p style={{ margin: "0 0 0.75rem" }}>
                  Se o Google respondeu <strong>Erro 400: redirect_uri_mismatch</strong>, é porque o
                  endereço de retorno abaixo não está autorizado no cliente OAuth. Copie-o e
                  cadastre-o em <em>Google Cloud Console › APIs e Serviços › Credenciais › URIs de
                  redirecionamento autorizados</em>.
                </p>

                <div style={{ background: "rgba(127,127,127,0.12)", border: "1px solid var(--card-border)", borderRadius: "8px", padding: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <code style={{ flex: 1, minWidth: 0, fontSize: "0.75rem", wordBreak: "break-all", color: "var(--foreground)" }}>
                    {config.redirectUri || "endereço público não configurado"}
                  </code>
                  {config.redirectUri && (
                    <button
                      onClick={copyRedirectUri}
                      style={{ background: "transparent", border: "1px solid var(--card-border)", color: "var(--foreground)", borderRadius: "6px", padding: "0.3rem 0.6rem", fontSize: "0.7rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      {copied ? "Copiado" : "Copiar"}
                    </button>
                  )}
                </div>

                <p style={{ margin: "0.75rem 0 0", fontSize: "0.72rem", opacity: 0.85 }}>
                  Origem deste endereço: {config.sourceLabel || "nenhuma"}.
                  {config.googleClientId && (
                    <> Cliente OAuth: <code style={{ fontSize: "0.7rem", wordBreak: "break-all" }}>{config.googleClientId}</code></>
                  )}
                </p>

                {config.problems.length > 0 && (
                  <ul style={{ margin: "0.75rem 0 0", paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {config.problems.map((problem, i) => (
                      <li key={i} style={{ fontSize: "0.75rem", color: "var(--warning)" }}>{problem}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </details>

        <div style={{ marginTop: "2rem", fontSize: "0.8rem", color: "var(--muted)" }}>
          &copy; {new Date().getFullYear()} Allugator. Todos os direitos reservados.
        </div>
      </motion.div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin { to { transform: rotate(360deg); } }
      `}} />
    </div>
  );
}
