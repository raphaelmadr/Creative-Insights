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
