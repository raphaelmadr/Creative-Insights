"use client";

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import 'dayjs/locale/pt-br';
import { ReactNode, useEffect, useState } from 'react';

export default function MuiProvider({ children }: { children: ReactNode }) {
  // Try to sync with data-theme if needed, but for now fallback to light/dark
  // based on a simple theme. The original CSS handles dark mode via `data-theme='dark'`
  // We can build a theme that respects that or just use the MD2 default theme.
  
  const theme = createTheme({
    palette: {
      primary: {
        main: '#27AE60',
      },
    },
    typography: {
      // A pilha inteira já vem do token; repetir a família aqui era a chance de
      // as duas divergirem na próxima troca de fonte.
      fontFamily: "var(--font-sans)",
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            boxShadow: '0 10px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
          }
        }
      }
    }
  });

  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="pt-br">
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  );
}
