"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useSession } from "next-auth/react";
import { X } from "lucide-react";
import { ToastStack, ToastItem } from "./ToastStack";
import type { SyncStatus } from "@/lib/sync-status";

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
  /**
   * O estado da sincronização automática, inteiro e vindo pronto do servidor.
   *
   * Substituiu `lastSyncAt` + `nextAutoSyncAt`, dois campos soltos que cada
   * tela recombinava do seu jeito. `null` enquanto o resumo não chegou.
   */
  syncStatus: SyncStatus | null;
  /** Relê o resumo agora — usado depois de uma sincronização manual. */
  refreshSyncStatus: () => Promise<void>;
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
  syncStatus: null,
  refreshSyncStatus: async () => {},
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
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

  /*
   * O RESUMO, e não a configuração inteira.
   *
   * `/api/settings` devolve os prompts de IA e, para quem administra, todas as
   * chaves — quilobytes que o cabeçalho não usa, baixados em toda visita a
   * qualquer tela. Aqui sai só o que o cabeçalho desenha: os booleanos de
   * integração e o estado da sincronização, já calculado pelo servidor.
   *
   * Virou `useCallback` porque agora tem três chamadores: a montagem, o relógio
   * que o mantém fresco e o fim de uma sincronização manual. Antes era uma
   * função solta dentro do efeito, buscada UMA vez por carregamento de página —
   * e era essa a razão de a tela anunciar "próxima automática: a qualquer
   * momento" para sempre: o dado nunca mais era relido, então nada podia mudar
   * de estado enquanto a aba ficasse aberta.
   */
  const refreshSyncStatus = React.useCallback(async () => {
    try {
      const response = await fetch("/api/settings/summary", { cache: "no-store" });
      if (!response.ok) return;
      const json = await response.json();
      if (!json.success) return;

      setSyncStatus(json.sync ?? null);

      const conectado = (id: string) =>
        !!(json.integrations || []).find((i: { id: string; configured: boolean }) => i.id === id)
          ?.configured;
      setIntegrations({ meta: conectado("META"), tiktok: conectado("TIKTOK"), google: false });
    } catch (err) {
      console.error("Falha ao carregar o resumo de configurações:", err);
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
    
    // Embrulhada como as duas vizinhas: chamada solta no corpo do efeito, o
    // lint a lê como gravação de estado síncrona e avisa de cascata.
    async function carregarNotificacoes() {
      await refreshTaskNotifications();
    }

    // Embrulhada como as vizinhas: chamada solta no corpo do efeito, o lint a
    // lê como gravação de estado síncrona e avisa de cascata.
    async function carregarResumo() {
      await refreshSyncStatus();
    }

    fetchSaved();
    carregarResumo();
    carregarNotificacoes();

    return () => {
      isMounted = false;
    };
  }, [status, refreshTaskNotifications, refreshSyncStatus]);

  /*
   * O relógio que mantém o estado da automação vivo.
   *
   * Sem ele o cabeçalho congela no que leu ao abrir a página: a janela vence, o
   * disparador morre, a sincronização roda — e a tela continua dizendo o mesmo
   * de meia hora atrás. Um minuto é folgado para um intervalo que se mede em
   * dezenas de minutos, e é uma requisição barata: uma linha por chave
   * primária.
   *
   * A contagem regressiva na tela não depende disto — ela anda sozinha, a cada
   * tique do relógio local, a partir do `nextEligibleAt` que já está em mãos.
   */
  useEffect(() => {
    if (status !== "authenticated") return;

    /*
     * Mais rápido enquanto alguém está sincronizando.
     *
     * Em repouso, um minuto é folgado para um intervalo que se mede em dezenas
     * de minutos. Com uma execução em curso o dado é outro: o botão está
     * desabilitado para toda a equipe, e manter alguém esperando até um minuto
     * depois de a sincronização ter terminado faz o sistema parecer travado.
     */
    const passo = syncStatus?.running ? 15 * 1000 : 60 * 1000;
    const relogio = setInterval(() => { refreshSyncStatus(); }, passo);
    return () => clearInterval(relogio);
  }, [status, refreshSyncStatus, syncStatus?.running]);

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
                
                /*
                 * O aviso diz POR QUE não veio nada. "Nenhuma novidade
                 * encontrada hoje" cobria situações opostas: a busca não estar
                 * configurada, os resultados já estarem todos no acervo, e a IA
                 * ter descartado tudo por não conter hack aplicável. A rota agora
                 * manda os números; aqui eles viram frase.
                 */
                const s = data.stats || {};
                if (data.newCount > 0) {
                  setToastMsg({ id: "search-updates", title: `🎉 ${data.newCount} ${data.newCount === 1 ? "novidade encontrada" : "novidades encontradas"}!`, isNew: true });
                } else if (s.semIa) {
                  setToastMsg({ id: "search-updates", title: "Nenhuma IA configurada — veja Configurações › IA.", isNew: false, isError: true });
                } else if (s.semTavily) {
                  setToastMsg({ id: "search-updates", title: "Busca web não configurada — falta a chave da Tavily.", isNew: false, isError: true });
                } else if (s.jaConhecidos && s.jaConhecidos === s.encontrados) {
                  setToastMsg({ id: "search-updates", title: "Nada novo: esta busca só trouxe artigos já salvos.", isNew: false });
                } else if (s.ignorados) {
                  setToastMsg({ id: "search-updates", title: `${s.ignorados} ${s.ignorados === 1 ? "artigo novo foi lido" : "artigos novos foram lidos"}, nenhum com hack aplicável.`, isNew: false });
                } else {
                  setToastMsg({ id: "search-updates", title: "Nenhuma novidade encontrada hoje.", isNew: false });
                }
                
                setTimeout(() => {
                  setToastMsg(null);
                }, 5000);
              } else if (data.type === 'error') {
                /*
                 * O erro ia só para o console do navegador: a busca simplesmente
                 * parava, sem explicação em tela. A mensagem que chega aqui já vem
                 * traduzida e sem credencial dentro (ver `friendlyFailureMessage`).
                 */
                console.error("API Stream Error:", data.error);
                setToastMsg({
                  id: "search-updates",
                  title: data.error || "A busca de insights falhou. Veja Configurações › Logs.",
                  isNew: false,
                  isError: true,
                });
                setTimeout(() => setToastMsg(null), 8000);
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
          } else if (data.type === 'busy') {
            /*
             * Outra pessoa já está sincronizando. Não é erro — é a trava global
             * funcionando. Sobe como resultado, e não como exceção, porque o
             * aviso na tela é de outro tom: não há nada a consertar.
             */
            completion = data;
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
    // A trava de verdade é a do servidor; esta só evita uma requisição que já
    // se sabe recusada, e o botão já está desabilitado pelo mesmo motivo.
    if (isSyncingAll || syncStatus?.running) return;

    setIsSyncingAll(true);
    setIsSyncingMeta(true);
    setSyncProgress(0);
    setSyncMessage("Iniciando sincronização das redes...");
    setToastMsg({ id: "sync-process", title: "Sincronizando redes (mês atual)...", isNew: false });

    try {
      const completion = await runSyncStream("/api/sync-all");

      /*
       * A trava recusou: alguém já está sincronizando. Para aqui — não faz
       * sentido seguir para as artes por cima do trabalho de outra pessoa.
       */
      if (completion?.type === "busy") {
        setToastMsg({
          id: "sync-process",
          title: `⏳ ${completion.message}`,
          isNew: false,
        });
        await refreshSyncStatus();
        return;
      }

      /*
       * Segundo passo, em requisição própria: as artes.
       *
       * Métricas e mídia não cabem numa execução só — juntas, quem ficava sem
       * tempo era sempre a mídia, que roda por último. Separadas, cada uma tem
       * o seu teto. Uma falha aqui não invalida as métricas que já entraram,
       * então ela só muda o tom do aviso final.
       */
      setSyncMessage("Salvando artes dos criativos...");
      let mediaOk = true;
      try {
        const media = await runSyncStream("/api/sync-media", "Artes");
        if (media?.type === "busy") mediaOk = false;
        else mediaOk = media?.mediaOk !== false;
      } catch {
        mediaOk = false;
      }

      // O carimbo vem do servidor, não do relógio do navegador: quem grava
      // `lastSyncAt` é `lib/channels.ts`, ao fim da execução, e adivinhá-lo aqui
      // criava uma segunda verdade que podia divergir por minutos.
      setSyncCounter(prev => prev + 1);

      /*
       * O AVISO É O VEREDITO, e nada além dele.
       *
       * Antes o resumo inteiro do servidor vinha para cá: contagens por fonte,
       * quantos dias do mês couberam na passada, quantas artes subiram — um
       * parágrafo num aviso flutuante que some em seis segundos. Ninguém termina
       * de ler, e quem quisesse reler não tinha onde. Agora a frase completa é
       * gravada em Configurações › Logs pelas próprias rotas, e aqui fica só o
       * que se decide olhando: deu certo, deu certo pela metade, ou falhou.
       *
       * O tom segue o PIOR dos dois resultados: um ✅ verde encabeçando uma
       * sincronização cujas artes não subiram se contradiz.
       */
      const parcial = completion?.partial || !mediaOk;
      setToastMsg({
        id: "sync-process",
        title: parcial
          ? "⚠️ Sincronização concluída em parte — veja os detalhes em Configurações › Logs"
          : "✅ Sincronização concluída",
        isNew: true,
      });
    } catch (err: any) {
      console.error("Erro na sincronização geral:", err);
      setToastMsg({
        id: "sync-process",
        title: "❌ A sincronização falhou — o motivo está em Configurações › Logs",
        isNew: false,
        isError: true,
      });
    } finally {
      setIsSyncingAll(false);
      setIsSyncingMeta(false);
      // O carimbo da última sincronização acabou de mudar no banco: relê, senão
      // o cabeçalho continua anunciando a anterior até o próximo minuto.
      refreshSyncStatus();
      setTimeout(() => setToastMsg(null), 6000);
    }
  };

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
      isSyncingMeta, syncStatus, refreshSyncStatus, syncCounter,
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
