"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useSession } from "next-auth/react";
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

/**
 * Uma demanda do Kanban atribuída a quem está olhando.
 *
 * Vem pronta do servidor, `message` inclusive: é ele que conhece o número da
 * demanda, e montar a frase aqui abriria uma segunda versão dela para divergir
 * da que vai em qualquer outro lugar.
 */
export interface TaskNotification {
  id: string;
  cardId: string;
  boardId: string;
  /** "MKT-42", ou nulo nas demandas anteriores à numeração. */
  code: string | null;
  title: string;
  message: string;
  /** ISO. Quando a demanda mudou pela última vez. */
  at: string;
}

interface NotificationContextType {
  updates: UpdateItem[];
  unreadCount: number;

  /** Canais conectados. Vem do mesmo resumo que traz o estado da sincronização. */
  integrations: { meta: boolean; tiktok: boolean; google: boolean };

  /** As demandas atribuídas a quem está logado — o conteúdo da aba do sino. */
  taskNotifications: TaskNotification[];
  taskUnreadCount: number;
  /** Limpa tudo, no servidor: some para esta pessoa, em qualquer navegador. */
  clearTaskNotifications: () => Promise<void>;
  refreshTaskNotifications: () => Promise<void>;
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
  integrations: { meta: false, tiktok: false, google: false },
  taskNotifications: [],
  taskUnreadCount: 0,
  clearTaskNotifications: async () => {},
  refreshTaskNotifications: async () => {},
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

  const [taskNotifications, setTaskNotifications] = useState<TaskNotification[]>([]);

  /** Quais canais estão conectados — o cabeçalho usa para acender os ícones. */
  const [integrations, setIntegrations] = useState({ meta: false, tiktok: false, google: false });

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

  /*
   * As notificações de demanda vêm do servidor, e não do `localStorage`.
   *
   * O contador de novidades guarda a última leitura no navegador, o que é
   * aceitável para uma lista pública. Para "as tarefas que são suas", não é:
   * limpar no computador e reencontrar tudo no celular parece defeito, e o
   * estado precisa acompanhar a PESSOA. Fica em `User.preferences`.
   */
  const refreshTaskNotifications = React.useCallback(async () => {
    try {
      const response = await fetch("/api/creator/notifications", { cache: "no-store" });
      if (!response.ok) return;
      const json = await response.json();
      if (json.success) setTaskNotifications(json.notifications || []);
    } catch (err) {
      console.error("Falha ao carregar notificações de demanda:", err);
    }
  }, []);

  const clearTaskNotifications = React.useCallback(async () => {
    // A lista some na hora; o servidor confirma depois. Esperar a ida e volta
    // para apagar uma lista deixa o clique sem resposta por meio segundo.
    setTaskNotifications([]);
    try {
      await fetch("/api/creator/notifications", { method: "POST" });
    } catch (err) {
      console.error("Falha ao limpar notificações:", err);
      // Falhou: devolve o que estava lá, em vez de fingir que limpou.
      refreshTaskNotifications();
    }
  }, [refreshTaskNotifications]);

  /*
   * Nada é buscado antes de haver sessão.
   *
   * Este provedor envolve a aplicação inteira — inclusive o `/login` e o
   * formulário público de demandas, que são vistos sem estar logado. Sem esta
   * guarda, uma visita anônima disparava três requisições a rotas autenticadas
   * e colhia três 401 no console, dando a impressão de sistema quebrado a quem
   * ainda nem entrou.
   */
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;

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
    
    /*
     * O RESUMO, e não a configuração inteira.
     *
     * `/api/settings` devolve os prompts de IA e, para quem administra, todas
     * as chaves — quilobytes que o cabeçalho não usa, baixados em toda visita a
     * qualquer tela. E o `TopBar` pedia a mesma rota em paralelo, para dois
     * booleanos: duas viagens à mesma linha do banco por carregamento.
     *
     * Agora é uma viagem só, e o estado das integrações sai daqui para o
     * cabeçalho pelo contexto, em vez de por uma segunda requisição.
     */
    async function fetchSettings() {
      try {
        const response = await fetch("/api/settings/summary", { cache: "no-store" });
        const json = await response.json();
        if (isMounted && json.success) {
          if (json.lastSyncAt) setLastSyncAt(json.lastSyncAt);
          if (json.lastCronSyncAt) setLastCronSyncAt(json.lastCronSyncAt);
          setCronConfig({
            enabled: json.cron?.enabled ?? false,
            intervalMinutes: json.cron?.intervalMinutes || 120,
          });
          const conectado = (id: string) =>
            !!(json.integrations || []).find((i: { id: string; configured: boolean }) => i.id === id)
              ?.configured;
          setIntegrations({ meta: conectado("META"), tiktok: conectado("TIKTOK"), google: false });
        }
      } catch (err) {
        console.error("Failed to fetch settings:", err);
      }
    }

    // Embrulhada como as duas vizinhas: chamada solta no corpo do efeito, o
    // lint a lê como gravação de estado síncrona e avisa de cascata.
    async function carregarNotificacoes() {
      await refreshTaskNotifications();
    }

    fetchSaved();
    fetchSettings();
    carregarNotificacoes();

    return () => {
      isMounted = false;
    };
  }, [status, refreshTaskNotifications]);

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

      /*
       * Segundo passo, em requisição própria: as artes.
       *
       * Métricas e mídia não cabem nos mesmos 300s — juntas, quem ficava sem
       * tempo era sempre a mídia, que roda por último. Separadas, cada uma tem
       * o seu teto. Uma falha aqui não invalida as métricas que já entraram,
       * então ela só entra no aviso final.
       */
      setSyncMessage("Salvando artes dos criativos...");
      let mediaSummary: string | null = null;
      let mediaOk = true;
      try {
        const media = await runSyncStream("/api/sync-media", "Artes");
        mediaSummary = media?.summary || "Artes salvas.";
        mediaOk = media?.mediaOk !== false;
      } catch (mediaErr) {
        mediaSummary = `As artes não puderam ser salvas: ${(mediaErr as Error).message}.`;
        mediaOk = false;
      }

      setLastSyncAt(new Date().toISOString());
      setSyncCounter(prev => prev + 1);

      /*
       * O ícone segue o PIOR dos dois resultados.
       *
       * Antes, um ✅ verde encabeçava a frase mesmo quando a segunda metade
       * dizia que centenas de imagens não tinham sido salvas — a mensagem se
       * contradizia e ninguém sabia se devia agir.
       */
      const base = completion?.message || "Sincronização das redes concluída!";
      const tudoCerto = !completion?.partial && mediaOk;
      setToastMsg({
        id: "sync-process",
        title: `${tudoCerto ? "✅" : "⚠️"} ${base}${mediaSummary ? ` · ${mediaSummary}` : ""}`,
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
      updates,
      unreadCount,
      /*
       * Sem sessão não há o que carregar, então "carregando" é falso — e
       * DERIVADO, não gravado.
       *
       * Escrever `setLoading(false)` dentro do efeito da sessão dispararia uma
       * segunda renderização só para dizer o que já dava para calcular, e é o
       * tipo de cascata que o lint aponta com razão.
       */
      loading: status === "unauthenticated" ? false : loading,
      loadingText,
      isSearching,
      integrations,
      taskNotifications,
      taskUnreadCount: taskNotifications.length,
      clearTaskNotifications, refreshTaskNotifications,
      
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
