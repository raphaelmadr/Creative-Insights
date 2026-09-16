"use client";

/**
 * Tema e filtros de cada pessoa, guardados na conta e não no navegador.
 *
 * O tema já era salvo em `localStorage`, o que significava que ele era do
 * aparelho e não da pessoa: quem abria pelo notebook e pelo celular recebia
 * dois painéis diferentes, e os filtros se perdiam a cada recarregamento. Agora
 * a conta é a fonte, e o `localStorage` fica só como cache do tema — ele é lido
 * de forma síncrona na primeira pintura, antes de qualquer resposta do
 * servidor, para a tela não piscar em branco e depois escurecer.
 *
 * Tema e filtros vivem no mesmo provider porque são o mesmo registro no banco.
 * Separá-los faria duas gravações concorrentes sobre a mesma linha.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import {
  DEFAULT_PREFERENCES,
  type DashboardFilters,
  type ThemePreference,
  type UserPreferences,
} from "@/lib/user-preferences";

const THEME_CACHE_KEY = "theme";

/** Espera de digitação antes de gravar os filtros — ver `saveFilters`. */
const FILTERS_SAVE_DEBOUNCE_MS = 600;

interface UserPreferencesContextValue {
  preferences: UserPreferences;
  /** `false` até a resposta do servidor chegar; os filtros só hidratam depois. */
  isLoaded: boolean;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
  saveFilters: (filters: Partial<DashboardFilters>) => void;
}

const UserPreferencesContext = createContext<UserPreferencesContextValue | undefined>(
  undefined
);

function readCachedTheme(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES.theme;

  try {
    const cached = window.localStorage.getItem(THEME_CACHE_KEY);
    if (cached === "light" || cached === "dark") return cached;
  } catch {
    // Navegador com armazenamento bloqueado: cai na preferência do sistema.
  }

  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function UserPreferencesProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";

  const [preferences, setPreferences] = useState<UserPreferences>(() => ({
    ...DEFAULT_PREFERENCES,
    filters: { ...DEFAULT_PREFERENCES.filters },
  }));
  const [isLoaded, setIsLoaded] = useState(false);

  // O tema pintado agora, antes de qualquer resposta do servidor.
  const [theme, setThemeState] = useState<ThemePreference>(DEFAULT_PREFERENCES.theme);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFilters = useRef<Partial<DashboardFilters>>({});

  // Cache do navegador: roda antes da busca no servidor e evita o pisca-pisca.
  useEffect(() => {
    setThemeState(readCachedTheme());
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(THEME_CACHE_KEY, theme);
    } catch {
      // Sem armazenamento: o tema vale para esta aba e volta do servidor depois.
    }
  }, [theme]);

  // A conta é a fonte: o que vier de lá vence o cache do navegador.
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    fetch("/api/me/preferences")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.success) return;
        setPreferences(json.preferences);
        setThemeState(json.preferences.theme);
        setIsLoaded(true);
      })
      .catch(() => {
        // Preferência é conveniência, não bloqueio: falhou, segue com o padrão.
        if (!cancelled) setIsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const persist = useCallback(
    (patch: Partial<UserPreferences>) => {
      if (!isAuthenticated) return;

      fetch("/api/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => {
        // Sem alarde: a próxima alteração tenta de novo.
      });
    },
    [isAuthenticated]
  );

  const setTheme = useCallback(
    (next: ThemePreference) => {
      setThemeState(next);
      setPreferences((current) => ({ ...current, theme: next }));
      persist({ theme: next });
    },
    [persist]
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === "light" ? "dark" : "light");
  }, [theme, setTheme]);

  /**
   * Filtros são gravados com espera porque mudam em rajada — arrastar um
   * seletor de datas dispara uma alteração por dia percorrido. Sem a espera,
   * seria uma gravação por quadro de animação.
   */
  const saveFilters = useCallback(
    (patch: Partial<DashboardFilters>) => {
      setPreferences((current) => ({
        ...current,
        filters: { ...current.filters, ...patch },
      }));

      pendingFilters.current = { ...pendingFilters.current, ...patch };

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const filters = pendingFilters.current;
        pendingFilters.current = {};
        persist({ filters: filters as DashboardFilters });
      }, FILTERS_SAVE_DEBOUNCE_MS);
    },
    [persist]
  );

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  return (
    <UserPreferencesContext.Provider
      value={{
        preferences: { ...preferences, theme },
        isLoaded,
        setTheme,
        toggleTheme,
        saveFilters,
      }}
    >
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  const context = useContext(UserPreferencesContext);
  if (context === undefined) {
    throw new Error("useUserPreferences precisa estar dentro de UserPreferencesProvider");
  }
  return context;
}
