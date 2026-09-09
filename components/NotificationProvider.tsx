"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { X } from "lucide-react";
import { ToastStack, ToastItem } from "./ToastStack";

export interface UpdateItem {
  id: string;
  title: string;
  content: string;
  urgency: string;
  category: string;
  sourceUrl?: string | null;
  thumbnailUrl?: string | null;
  timestamp: string; // ISO String
}

interface NotificationContextType {
  updates: UpdateItem[];
  unreadCount: number;
  loading: boolean;
  loadingText: string;
  isSearching: boolean;
  searchForUpdates: () => Promise<void>;
  markAllAsRead: () => void;
  hasMore: boolean;
  isFetchingMore: boolean;
  loadMoreUpdates: () => Promise<void>;
  isSyncingMeta: boolean;
  /** Fim da última sincronização — manual ou automática, completa ou parcial. */
  lastSyncAt: string | null;
  /** Quando o cron pode voltar a rodar. `null` se a automação está desligada. */
  nextAutoSyncAt: string | null;
  syncCounter: number;
  syncMessage: string;
  syncProgress: number;
  isSyncingAll: boolean;
  syncAll: () => Promise<void>;
  lastReadDate: Date | null;
}

const NotificationContext = createContext<NotificationContextType>({
  updates: [],
  unreadCount: 0,
  loading: true,
  loadingText: "Iniciando...",
  isSearching: false,
  searchForUpdates: async () => {},
  markAllAsRead: () => {},
  hasMore: false,
  isFetchingMore: false,
  loadMoreUpdates: async () => {},
  isSyncingMeta: false,
  lastSyncAt: null,
  nextAutoSyncAt: null,
  syncCounter: 0,
  syncMessage: "",
  syncProgress: 0,
  isSyncingAll: false,
  syncAll: async () => {},
  lastReadDate: null,
});

export const useNotifications = () => useContext(NotificationContext);

export default function NotificationProvider({ children }: { children: ReactNode }) {
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastReadDate, setLastReadDate] = useState<Date | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingText, setLoadingText] = useState("Conectando...");
  
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  
  const [isSyncingMeta, setIsSyncingMeta] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncMessage, setSyncMessage] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastCronSyncAt, setLastCronSyncAt] = useState<string | null>(null);
  const [cronConfig, setCronConfig] = useState<{ enabled: boolean; intervalMinutes: number }>({
    enabled: false,
    intervalMinutes: 120,
  });
  const [syncCounter, setSyncCounter] = useState(0);
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const setToastMsg = (toast: {id?: string; title: string; isNew: boolean; isError?: boolean} | null) => {
    if (!toast) return;
    const id = toast.id || Math.random().toString(36).substring(2, 9);
    setToasts(prev => {
      const existing = prev.findIndex(t => t.id === id);
      if (existing >= 0) {
        const newToasts = [...prev];
        newToasts[existing] = { ...toast, id };
        return newToasts;
      }
      return [{ ...toast, id }, ...prev];
    });
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  useEffect(() => {
    let isMounted = true;
    
    // Carregamento rápido (apenas banco de dados) on mount
    async function fetchSaved() {
      try {
        const response = await fetch("/api/insights/saved?skip=0&take=10");
        const data = await response.json();
        if (isMounted) {
          setUpdates(data.updates || []);
          setHasMore(data.hasMore || false);
          setPage(1);
          calculateUnread(data.updates || []);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch saved insights:", err);
        if (isMounted) setLoading(false);
      }
    }
    
    async function fetchSettings() {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        const json = await response.json();
        if (isMounted && json.success && json.data) {
          if (json.data.lastSyncAt) setLastSyncAt(json.data.lastSyncAt);
          if (json.data.lastCronSyncAt) setLastCronSyncAt(json.data.lastCronSyncAt);
          setCronConfig({
            enabled: json.data.cronSyncEnabled ?? false,
            intervalMinutes: json.data.cronSyncInterval || 120,
          });
        }
      } catch (err) {
        console.error("Failed to fetch settings:", err);
      }
    }

    fetchSaved();
    fetchSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  // Busca ativa (via IA + Tavily)
  const searchForUpdates = async () => {
    if (isSearching) return;
    setIsSearching(true);
    setLoadingText("Iniciando busca...");
    
    try {
      const response = await fetch("/api/insights/news");
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(Boolean);
          
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.type === 'status') {
                setLoadingText(data.message);
              } else if (data.type === 'complete') {
                setUpdates(data.updates || []);
                calculateUnread(data.updates || []);
                setIsSearching(false);
                
                // Dispara o Toast de aviso!
                if (data.newCount > 0) {
                  setToastMsg({ id: "search-updates", title: `🎉 ${data.newCount} Novidades encontradas!`, isNew: true });
                } else {
                  setToastMsg({ id: "search-updates", title: "Nenhuma novidade encontrada hoje.", isNew: false });
                }
                
                setTimeout(() => {
                  setToastMsg(null);
                }, 5000);
              } else if (data.type === 'error') {
                console.error("API Stream Error:", data.error);
                setIsSearching(false);
              }
            } catch (e) {
              console.error("Failed to parse NDJSON line", line);
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to search for updates:", err);
      setIsSearching(false);
    }
  };

  const calculateUnread = (fetchedUpdates: UpdateItem[]) => {
    try {
      const lastReadStr = localStorage.getItem("lastReadUpdates");
      if (!lastReadStr) {
        // Mark all as read by default instead of unread for new sessions
        const now = new Date();
        setLastReadDate(now);
        setUnreadCount(0);
        localStorage.setItem("lastReadUpdates", now.toISOString());
        return;
      }
      
      const lastReadDateObj = new Date(lastReadStr);
      setLastReadDate(lastReadDateObj);
      let count = 0;
      fetchedUpdates.forEach(update => {
        if (new Date(update.timestamp) > lastReadDateObj) {
          count++;
        }
      });
      setUnreadCount(count);
    } catch (e) {
      setUnreadCount(fetchedUpdates.length);
    }
  };

  const loadMoreUpdates = async () => {
    if (!hasMore || isFetchingMore) return;
    setIsFetchingMore(true);
    try {
      const skip = page * 10;
      const response = await fetch(`/api/insights/saved?skip=${skip}&take=10`);
      const data = await response.json();
      
      if (data.updates) {
        setUpdates(prev => {
          const newUpdates = data.updates.filter((u: any) => !prev.some(p => p.id === u.id));
          return [...prev, ...newUpdates];
        });
        setHasMore(data.hasMore || false);
        setPage(prev => prev + 1);
      }
    } catch (err) {
      console.error("Failed to load more updates:", err);
    } finally {
      setIsFetchingMore(false);
    }
  };

  const markAllAsRead = () => {
    const now = new Date();
    localStorage.setItem("lastReadUpdates", now.toISOString());
    setLastReadDate(now);
    setUnreadCount(0);
  };

  const runSyncStream = async (url: string, prefixMessage?: string) => {
    const response = await fetch(url, { method: "POST" });
    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let buffer = "";
    let completion: any = null;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ""; // Retém o fragmento incompleto para o próximo chunk
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          let data;
          try {
            data = JSON.parse(line);
          } catch (e: any) {
            console.error("Falha ao fazer parse do JSON no chunk:", line, e);
            continue;
          }
          
          if (data.type === 'progress' || data.type === 'complete') {
            setSyncMessage(prefixMessage ? `[${prefixMessage}] ${data.message}` : data.message);
            setSyncProgress(data.percentage);
            if (data.type === 'complete') completion = data;
          } else if (data.type === 'error') {
            throw new Error(data.error);
          }
        }
      }
    }

    return completion;
  };

  /**
   * A sincronização manual: todas as fontes configuradas, mês corrente.
   *
   * É a única operação de sincronização exposta na interface, idêntica em
   * desktop e mobile, e executa no backend exatamente a mesma rotina que o
   * cron — `runSync()`. Não há modo rápido e modo profundo.
   *
   * O backend percorre as fontes em série e reporta o resultado de cada uma;
   * uma fonte que falha aparece como erro em vez de ser silenciosamente
   * ignorada, como acontecia quando Meta e TikTok rodavam em Promise.all.
   */
  const syncAll = async () => {
    if (isSyncingAll) return;

    setIsSyncingAll(true);
    setIsSyncingMeta(true);
    setSyncProgress(0);
    setSyncMessage("Iniciando sincronização das redes...");
    setToastMsg({ id: "sync-process", title: "Sincronizando redes (mês atual)...", isNew: false });

    try {
      const completion = await runSyncStream("/api/sync-all");

      setLastSyncAt(new Date().toISOString());
      setSyncCounter(prev => prev + 1);

      setToastMsg({
        id: "sync-process",
        title: completion?.partial
          ? `⚠️ ${completion.message}`
          : `✅ ${completion?.message || "Sincronização das redes concluída!"}`,
        isNew: true,
      });
    } catch (err: any) {
      console.error("Erro na sincronização geral:", err);
      setToastMsg({
        id: "sync-process",
        title: `❌ ${err.message || "Erro na sincronização das redes."}`,
        isNew: false,
        isError: true,
      });
    } finally {
      setIsSyncingAll(false);
      setIsSyncingMeta(false);
      setTimeout(() => setToastMsg(null), 6000);
    }
  };

  /**
   * `lastCronSyncAt` marca o início da última execução automática; somado ao
   * intervalo configurado, dá a próxima janela. `null` desliga a exibição em
   * vez de anunciar uma previsão que não vai acontecer.
   */
  const nextAutoSyncAt = cronConfig.enabled && lastCronSyncAt
    ? new Date(new Date(lastCronSyncAt).getTime() + cronConfig.intervalMinutes * 60 * 1000).toISOString()
    : null;

  return (
    <NotificationContext.Provider value={{ 
      updates, unreadCount, loading, loadingText, isSearching, 
      searchForUpdates, markAllAsRead, hasMore, isFetchingMore, 
      loadMoreUpdates,
      isSyncingMeta, lastSyncAt, nextAutoSyncAt, syncCounter,
      syncMessage, syncProgress,
      isSyncingAll, syncAll, lastReadDate
    }}>
      {children}
      {/* Sistema de Toasts */}
      <ToastStack 
        toasts={toasts} 
        removeToast={removeToast} 
        syncProgress={syncProgress} 
        isSyncingMeta={isSyncingMeta} 
        syncMessage={syncMessage} 
      />
    </NotificationContext.Provider>
  );
}
