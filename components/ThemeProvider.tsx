"use client";

/**
 * O tema, para quem só quer o tema.
 *
 * A implementação mudou de lugar: tema e filtros são o mesmo registro na conta
 * e são gravados juntos por `UserPreferencesProvider`. Este arquivo continua
 * existindo porque `useTheme()` é usado em toda a interface — e porque ter dois
 * estados de tema, um aqui e outro lá, é exatamente o tipo de divergência que
 * faria o botão do topo discordar da tela.
 */

import { useUserPreferences } from "./UserPreferencesProvider";

export function useTheme() {
  const { preferences, toggleTheme, setTheme } = useUserPreferences();
  return { theme: preferences.theme, toggleTheme, setTheme };
}

/** Mantido para quem importa `ThemeProvider`; a árvore real é a de preferências. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
