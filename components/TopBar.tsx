"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Moon, Sun, Bell, Settings, RefreshCw, Database, Image as ImageIcon, Sparkles, Menu, X } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useNotifications } from "./NotificationProvider";
import SettingsModal from "./SettingsModal";
import styles from "./TopBar.module.css";

export default function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const { unreadCount, isSyncingAll, lastSyncAt, lastFastSyncAt, lastDeepSyncAt, syncAll, updates, isSyncingMeta, syncMessage, syncProgress, isSearching, loadingText } = useNotifications();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSyncMenuOpen, setIsSyncMenuOpen] = useState(false);

  const notificationsContent = (
    <div className={styles.notificationsPopup}>
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--card-border)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Notificações</span>
        {unreadCount > 0 && <span style={{ fontSize: '0.75rem', background: 'var(--primary)', color: '#fff', padding: '0.1rem 0.5rem', borderRadius: '10px' }}>{unreadCount} novas</span>}
      </div>
    
      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
        {(isSyncingAll || isSyncingMeta || isSearching) && (
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--card-border)', background: 'rgba(16, 185, 129, 0.05)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <RefreshCw size={14} className="spin" style={{ animation: "spin 2s linear infinite" }} />
              Sincronização em andamento
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
              {isSyncingMeta ? syncMessage : (isSearching ? loadingText : 'Processando...')}
            </div>
            {isSyncingMeta && (
              <div style={{ width: "100%", height: "4px", background: "var(--card-border)", borderRadius: "10px", overflow: "hidden", marginTop: '0.5rem' }}>
                <div style={{ width: `${syncProgress}%`, height: "100%", background: "var(--success)", transition: "width 0.3s ease" }} />
              </div>
            )}
          </div>
        )}
        
        {updates.length === 0 ? (
          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
            Nenhuma novidade no momento.
          </div>
        ) : (
          updates.slice(0, 5).map(update => {
            const isSystemUpdate = update.category?.toLowerCase() === 'sistema';
            
            const innerContent = (
              <div style={{ padding: '1rem', borderBottom: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: '0.25rem', background: unreadCount > 0 ? 'rgba(255,255,255,0.02)' : 'transparent', cursor: isSystemUpdate ? 'default' : 'pointer', transition: 'background 0.2s' }} onMouseOver={(e) => { if(!isSystemUpdate) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }} onMouseOut={(e) => { if(!isSystemUpdate) e.currentTarget.style.background = unreadCount > 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{update.title}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.4' }}>{update.content}</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--primary)', marginTop: '0.25rem' }}>
                   {new Date(update.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );

            return isSystemUpdate ? (
              <div key={update.id}>{innerContent}</div>
            ) : (
              <Link key={update.id} href={`/insights#update-${update.id}`} onClick={() => setIsNotificationsOpen(false)} style={{ textDecoration: 'none', color: 'inherit' }}>
                {innerContent}
              </Link>
            );
          })
        )}
      </div>
      
      <Link href="/insights" onClick={() => setIsNotificationsOpen(false)} style={{ padding: '0.75rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', color: 'var(--foreground)', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', borderTop: '1px solid var(--card-border)', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}>
        Ver todas as novidades
      </Link>
    </div>
  );

  return (
    <>
      <header className={styles.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button 
            className={styles.mobileMenuBtn} 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            title="Menu"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          <Link href="/" className={styles.logo} style={{ textDecoration: "none" }}>
            <span style={{ fontSize: "1.25rem", fontWeight: 800, fontFamily: "var(--font-heading)", color: "var(--foreground)" }}>
              creative<span className="dot-green">.</span>insights
            </span>
          </Link>

          <nav className={styles.desktopNav} style={{ display: "flex", gap: "1.5rem", alignItems: "center", marginLeft: "2rem" }}>
            <Link href="/" className={styles.navLink}>Início</Link>
            <Link href="/insights" className={styles.navLink}>Insights</Link>
            <Link href="/similaridade" className={styles.navLink}>Auditoria de Entity IDs</Link>
            <Link href="/analises" className={styles.navLink}>Análises</Link>
            <Link href="/equipe" className={styles.navLink}>Equipe</Link>
          </nav>
        </div>

        {isMobileMenuOpen && (
          <div className={styles.mobileMenuOverlay}>
            <Link href="/" className={styles.navLink} onClick={() => setIsMobileMenuOpen(false)}>Início</Link>
            <Link href="/insights" className={styles.navLink} onClick={() => setIsMobileMenuOpen(false)}>Insights</Link>
            <Link href="/similaridade" className={styles.navLink} onClick={() => setIsMobileMenuOpen(false)}>Auditoria de Entity IDs</Link>
            <Link href="/analises" className={styles.navLink} onClick={() => setIsMobileMenuOpen(false)}>Análises</Link>
            <Link href="/equipe" className={styles.navLink} onClick={() => setIsMobileMenuOpen(false)}>Equipe</Link>
            
            <div style={{ borderTop: "1px solid var(--sidebar-border)", paddingTop: "1rem", marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <button 
                    onClick={() => { syncAll('fast'); setIsMobileMenuOpen(false); }} 
                    disabled={isSyncingAll}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                      padding: '0.75rem', borderRadius: '8px',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      background: isSyncingAll ? 'transparent' : 'rgba(16, 185, 129, 0.15)',
                      color: isSyncingAll ? 'var(--muted)' : 'var(--success)', fontSize: '0.85rem', fontWeight: 700,
                      cursor: isSyncingAll ? 'not-allowed' : 'pointer',
                      opacity: isSyncingAll ? 0.5 : 1,
                      transition: 'all 0.2s', width: '100%'
                    }}
                  >
                    <RefreshCw size={16} className={isSyncingAll ? "spin" : ""} style={{ animation: isSyncingAll ? "spin 2s linear infinite" : "none" }} />
                    Sync Rápido
                  </button>
                  {lastFastSyncAt && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--muted)', textAlign: 'center', opacity: 0.7 }}>
                      Última att: {new Date(lastFastSyncAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <button 
                    onClick={() => { syncAll('deep'); setIsMobileMenuOpen(false); }} 
                    disabled={isSyncingAll}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                      padding: '0.75rem', borderRadius: '8px',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      background: isSyncingAll ? 'transparent' : 'rgba(59, 130, 246, 0.15)',
                      color: isSyncingAll ? 'var(--muted)' : '#3b82f6', fontSize: '0.85rem', fontWeight: 700,
                      cursor: isSyncingAll ? 'not-allowed' : 'pointer',
                      opacity: isSyncingAll ? 0.5 : 1,
                      transition: 'all 0.2s', width: '100%'
                    }}
                  >
                    <Database size={16} className={isSyncingAll ? "spin" : ""} style={{ animation: isSyncingAll ? "spin 2s linear infinite" : "none" }} />
                    Sync Profundo
                  </button>
                  {lastDeepSyncAt && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--muted)', textAlign: 'center', opacity: 0.7 }}>
                      Última att: {new Date(lastDeepSyncAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        <div className={styles.actions} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: 'auto' }}>
          {/* Integrações */}
          <div className={styles.desktopOnly} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginRight: '0.5rem', paddingRight: '1.25rem', borderRight: '1px solid var(--sidebar-border)' }}>
            {/* Meta - Conectado */}
            <div title="Meta Ads Conectado" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z"/>
              </svg>
            </div>
            {/* TikTok - Pendente */}
            <div title="TikTok Ads (Em breve)" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(128, 128, 128, 0.15)', color: 'var(--muted)', opacity: 0.6, cursor: 'not-allowed' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
              </svg>
            </div>
            {/* Google - Pendente */}
            <div title="Google Ads (Em breve)" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(128, 128, 128, 0.15)', color: 'var(--muted)', opacity: 0.6, cursor: 'not-allowed' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/>
              </svg>
            </div>
          </div>

          <div className={styles.desktopSync} style={{ position: 'relative', marginRight: '1rem' }}>
            <button
              onClick={() => setIsSyncMenuOpen(!isSyncMenuOpen)}
              disabled={isSyncingAll}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.5rem 1rem', borderRadius: '100px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: isSyncingAll ? 'transparent' : 'rgba(255, 255, 255, 0.05)',
                color: isSyncingAll ? 'var(--muted)' : 'var(--foreground)', fontSize: '0.8rem', fontWeight: 600,
                cursor: isSyncingAll ? 'not-allowed' : 'pointer',
                opacity: isSyncingAll ? 0.5 : 1,
                transition: 'all 0.2s'
              }}
            >
              <RefreshCw size={16} className={isSyncingAll ? "spin" : ""} style={{ animation: isSyncingAll ? "spin 2s linear infinite" : "none" }} />
              {isSyncingAll ? "Sincronizando..." : "Sincronizar"}
            </button>
            
            {isSyncMenuOpen && !isSyncingAll && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 0.5rem)', right: 0,
                background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                borderRadius: '12px', padding: '0.5rem', minWidth: '280px',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)', zIndex: 50,
                display: 'flex', flexDirection: 'column', gap: '0.25rem'
              }}>
                <button 
                  onClick={() => { syncAll('fast'); setIsSyncMenuOpen(false); }} 
                  style={{
                    display: 'flex', flexDirection: 'column',
                    padding: '0.75rem', borderRadius: '8px',
                    border: 'none', background: 'transparent',
                    textAlign: 'left', cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontWeight: 600, fontSize: '0.85rem' }}>
                    <RefreshCw size={14} /> Sync Rápido
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                    Atualiza métricas do mês atual instantaneamente.
                  </span>
                  {lastFastSyncAt && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--muted)', opacity: 0.7, marginTop: '0.25rem' }}>
                      Última att: {new Date(lastFastSyncAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  )}
                </button>
                <button 
                  onClick={() => { syncAll('deep'); setIsSyncMenuOpen(false); }} 
                  style={{
                    display: 'flex', flexDirection: 'column',
                    padding: '0.75rem', borderRadius: '8px',
                    border: 'none', background: 'transparent',
                    textAlign: 'left', cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#3b82f6', fontWeight: 600, fontSize: '0.85rem' }}>
                    <Database size={14} /> Sync Profundo
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                    Baixa novas mídias e recalcula histórico.
                  </span>
                  {lastDeepSyncAt && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--muted)', opacity: 0.7, marginTop: '0.25rem' }}>
                      Última att: {new Date(lastDeepSyncAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>

          <div style={{ position: "relative" }}>
            <button 
              className={styles.iconButton} 
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)} 
              title="Notificações e Insights"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span style={{
                  position: "absolute", top: -2, right: -2,
                  background: "red", color: "white",
                  fontSize: "0.65rem", fontWeight: "bold",
                  width: 16, height: 16, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  {unreadCount}
                </span>
              )}
            </button>
            
            {/* Desktop notifications popup (relative to the bell icon) */}
            {isNotificationsOpen && (
              <div className={styles.desktopOnlyPopup}>
                {notificationsContent}
              </div>
            )}
          </div>

          <button className={styles.iconButton} onClick={() => setIsSettingsOpen(true)} title="Configurações">
            <Settings size={20} />
          </button>

          <button className={styles.iconButton} onClick={toggleTheme} title="Alternar Tema">
            {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile popups rendered outside of the sticky header to bypass iOS Safari fixed positioning bugs */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        onSave={() => window.location.reload()}
      />
      
      {isNotificationsOpen && (
        <div 
          className="mobile-overlay-wrapper"
          style={{ padding: '1rem' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsNotificationsOpen(false);
          }}
        >
          {notificationsContent}
        </div>
      )}
    </>
  );
}
