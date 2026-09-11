"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import TopBar from "@/components/TopBar";
import { Sparkles, CheckCircle, Lightbulb, Loader2, ExternalLink, RefreshCcw, X } from "lucide-react";
import { ArticleCover, sourceDomain } from "@/components/ArticleCover";
import { Skeleton } from "@/components/Skeleton";
import { useNotifications, UpdateItem } from "@/components/NotificationProvider";

export default function InsightsPage() {
  const { updates, loading, loadingText, isSearching, searchForUpdates, markAllAsRead, unreadCount, hasMore, isFetchingMore, loadMoreUpdates, lastReadDate } = useNotifications();
  const [selectedUpdate, setSelectedUpdate] = useState<UpdateItem | null>(null);

  const getUrgencyColor = (urgency: string) => {
    switch (urgency?.toLowerCase()) {
      case "alta": return "var(--destructive)";
      case "média": 
      case "media": return "var(--warning)";
      case "baixa": return "var(--success)";
      default: return "var(--primary)";
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category?.toLowerCase()) {
      case "criativos": return "#2ed573";
      case "estudo de caso": return "#ff4757";
      case "growth": return "#3742fa";
      case "dica de ferramenta": return "#ffa502";
      default: return "#5352ed";
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar />
      {/* Mesma medida das outras telas: a largura do container é da classe
          `dashboard-container`, não de um número solto por página. */}
      <div className="dashboard-container" style={{ flexDirection: "column" }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 style={{ fontSize: "2.5rem", fontWeight: 800, marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }} className="lowercase-title">
              <Lightbulb size={32} color="var(--primary)" />
              insights de mercado &amp; criativos<span className="dot-green">.</span>
            </h1>
            <p style={{ opacity: 0.7, marginTop: "0.5rem" }}>
              Acompanhe as últimas tendências, estudos de caso e novidades de alta performance para o time criativo.
            </p>
          </div>
          
          <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
            {/* Ação principal da tela: é ela que traz conteúdo novo. */}
            <button
              onClick={searchForUpdates}
              disabled={isSearching || loading}
              className="btn btn-primary"
            >
              <RefreshCcw size={16} className={isSearching ? "spin" : ""} />
              {isSearching ? "Buscando..." : "Buscar novos insights"}
            </button>

            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="btn btn-secondary">
                <CheckCircle size={16} />
                Marcar {unreadCount} como {unreadCount === 1 ? "lido" : "lidos"}
              </button>
            )}
          </div>
        </div>

        {/* Loading Sutil de Busca Ativa */}
        {isSearching && !loading && (
          <div className="glass-panel" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", gap: "1rem", border: "1px solid var(--primary)" }}>
            <Loader2 size={24} color="var(--primary)" className="spin" style={{ animation: "spin 2s linear infinite" }} />
            <span style={{ fontWeight: 500 }}>{loadingText}</span>
          </div>
        )}

        {loading ? (
          <div className="insight-grid">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="glass-panel" style={{ display: "flex", flexDirection: "column", border: "1px solid var(--card-border)", overflow: "hidden" }}>
                <Skeleton width="100%" height="160px" borderRadius="0" />
                <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem", flex: 1 }}>
                  <Skeleton width="100%" height="24px" />
                  <Skeleton width="80%" height="24px" />
                  <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <Skeleton width="100%" height="14px" />
                    <Skeleton width="100%" height="14px" />
                    <Skeleton width="60%" height="14px" />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: "1rem" }}>
                    <Skeleton width="80px" height="12px" />
                    <Skeleton width="100px" height="16px" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {updates.length === 0 ? (
              <div style={{ textAlign: "center", padding: "4rem", opacity: 0.5 }}>
                Nenhuma atualização encontrada no momento.
              </div>
            ) : (
              <>
                <div className="insight-grid">
                  {updates.map((update) => {
                    const isUnread = lastReadDate ? new Date(update.timestamp) > lastReadDate : true;
                    return (
                    <div 
                      key={update.id} 
                      id={`update-${update.id}`} 
                      className="insight-card"
                      onClick={() => setSelectedUpdate(update)}
                    >
                      {/* A capa: a imagem do artigo quando existe, uma capa
                          desenhada com a cor da fonte quando o site bloqueia
                          leitura — ver components/ArticleCover. */}
                      <div style={{ position: "relative" }}>
                        <ArticleCover
                          thumbnailUrl={update.thumbnailUrl}
                          sourceUrl={update.sourceUrl}
                          title={update.title}
                        />

                        {/* Os selos ficam sobre um véu, e não soltos na foto:
                            sobre imagem clara o texto sumia. */}
                        <div style={{ position: "absolute", top: "0.7rem", left: "0.7rem", right: "0.7rem", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          <span style={{
                            padding: "0.2rem 0.5rem", borderRadius: "100px",
                            fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                            background: "rgba(10,10,12,0.72)", color: getCategoryColor(update.category),
                            backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
                          }}>
                            {update.category}
                          </span>
                          {isUnread && (
                            <span style={{
                              padding: "0.2rem 0.5rem", borderRadius: "100px",
                              fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                              background: "var(--primary)", color: "#fff",
                              marginLeft: "auto",
                            }}>
                              Novo
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Content Area */}
                      <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem", flex: 1 }}>
                        <h3 style={{ fontSize: "1.1rem", color: "var(--foreground)", margin: 0, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {update.title}
                        </h3>
                        
                        <div className="insight-card-preview" style={{ 
                          opacity: 0.7, 
                          maxHeight: "5.5rem",
                          overflow: "hidden",
                          WebkitMaskImage: "linear-gradient(to bottom, black 40%, transparent 100%)",
                          maskImage: "linear-gradient(to bottom, black 40%, transparent 100%)"
                        }}>
                          <ReactMarkdown>{update.content}</ReactMarkdown>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginTop: "auto", paddingTop: "0.9rem", borderTop: "1px solid var(--card-border)" }}>
                          {/* De onde veio e quando: os dois dados que decidem
                              se vale abrir, e que o cartão não mostrava. */}
                          <span style={{ fontSize: "0.72rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 0 }}>
                            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {sourceDomain(update.sourceUrl) || "fonte não informada"}
                            </span>
                            <span style={{ opacity: 0.45 }}>·</span>
                            <span style={{ whiteSpace: "nowrap" }}>
                              {new Date(update.timestamp).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                            </span>
                          </span>
                          <span className="insight-card-cta" style={{ fontSize: "0.75rem", color: "var(--primary)", fontWeight: 600, whiteSpace: "nowrap" }}>Ler &rarr;</span>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
                
                {hasMore && (
                  <button
                    onClick={loadMoreUpdates}
                    disabled={isFetchingMore}
                    className="btn btn-secondary btn-block"
                    style={{ marginTop: "0.5rem" }}
                  >
                    {isFetchingMore ? (
                      <>
                        <Loader2 size={18} className="spin" style={{ animation: "spin 2s linear infinite" }} />
                        Carregando mais...
                      </>
                    ) : (
                      "Carregar mais Insights"
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Modal de Leitura */}
      {selectedUpdate && (
        <div 
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
            display: "flex", justifyContent: "center", alignItems: "center",
            zIndex: 9999, padding: "2rem"
          }}
          onClick={() => setSelectedUpdate(null)}
        >
          <div 
            className="glass-panel"
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: "800px", maxHeight: "90vh",
              overflowY: "auto", display: "flex", flexDirection: "column",
              position: "relative", backgroundColor: "var(--card-bg)",
              color: "var(--foreground)",
              padding: 0, borderRadius: "12px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)"
            }}
          >
            <button 
              onClick={() => setSelectedUpdate(null)}
              style={{
                position: "absolute", top: "1rem", right: "1rem",
                background: "rgba(0,0,0,0.6)", border: "none", color: "#fff",
                borderRadius: "50%", width: "40px", height: "40px",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", zIndex: 10, backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)"
              }}
            >
              <X size={24} />
            </button>

            {/* Mesma capa da grade: o modal também nunca abre sem imagem. */}
            <ArticleCover
              thumbnailUrl={selectedUpdate.thumbnailUrl}
              sourceUrl={selectedUpdate.sourceUrl}
              title={selectedUpdate.title}
              height="260px"
            />

            <div style={{ padding: "2.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <span style={{ 
                  padding: "0.25rem 0.75rem", borderRadius: "1rem", fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase",
                  backgroundColor: getCategoryColor(selectedUpdate.category) + "20",
                  color: getCategoryColor(selectedUpdate.category), border: `1px solid ${getCategoryColor(selectedUpdate.category)}40`
                }}>
                  {selectedUpdate.category}
                </span>
                <span style={{ 
                  padding: "0.25rem 0.75rem", borderRadius: "1rem", fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase",
                  backgroundColor: getUrgencyColor(selectedUpdate.urgency) + "20",
                  color: getUrgencyColor(selectedUpdate.urgency), border: `1px solid ${getUrgencyColor(selectedUpdate.urgency)}40`
                }}>
                  {selectedUpdate.urgency}
                </span>
                <span style={{ fontSize: "0.9rem", opacity: 0.6, display: "flex", alignItems: "center", marginLeft: "auto" }}>
                  {new Date(selectedUpdate.timestamp).toLocaleDateString("pt-BR", { day: '2-digit', month: 'long', year: 'numeric' })}
                </span>
              </div>

              <h2 style={{ fontSize: "1.75rem", margin: "0.5rem 0", color: "var(--foreground)", lineHeight: 1.3 }}>{selectedUpdate.title}</h2>

              <div className="insight-modal-content" style={{ opacity: 0.9, lineHeight: 1.6, fontSize: "0.95rem", color: "var(--foreground)", display: "flex", flexDirection: "column", gap: "1rem" }}>
                <ReactMarkdown>{selectedUpdate.content}</ReactMarkdown>
              </div>

              {selectedUpdate.sourceUrl && (
                <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--card-border)" }}>
                  <a 
                    href={selectedUpdate.sourceUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "0.5rem",
                      padding: "1rem 1.5rem", backgroundColor: "var(--primary)",
                      borderRadius: "0.5rem", color: "#fff",
                      textDecoration: "none", fontWeight: 600, transition: "background-color 0.2s"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--primary-hover)"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "var(--primary)"}
                  >
                    Ler matéria original completa <ExternalLink size={18} />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .insight-card-preview h1,
        .insight-card-preview h2,
        .insight-card-preview h3,
        .insight-card-preview h4 {
          font-size: 0.95rem !important;
          font-weight: 700 !important;
          margin-top: 0 !important;
          margin-bottom: 0.25rem !important;
          line-height: 1.2 !important;
          color: var(--foreground) !important;
        }
        .insight-card-preview p,
        .insight-card-preview ul,
        .insight-card-preview li {
          font-size: 0.85rem !important;
          margin-top: 0 !important;
          margin-bottom: 0.25rem !important;
          line-height: 1.5 !important;
          color: var(--foreground) !important;
        }
        .insight-card-preview strong {
          font-weight: 700 !important;
        }

        .insight-modal-content h1,
        .insight-modal-content h2,
        .insight-modal-content h3 {
          font-size: 1.2rem !important;
          font-weight: 700 !important;
          margin-top: 1rem !important;
          margin-bottom: 0.5rem !important;
        }
        .insight-modal-content p,
        .insight-modal-content li {
          font-size: 0.95rem !important;
          line-height: 1.6 !important;
        }
      `}</style>
    </main>
  );
}
