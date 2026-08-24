import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import SessionProvider from "@/components/SessionProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import NotificationProvider from "@/components/NotificationProvider";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
});

export const metadata: Metadata = {
  title: "Creative Insights",
  description: "Dashboard de Performance Criativa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${plusJakartaSans.variable}`}
      suppressHydrationWarning
    >
      <body className={plusJakartaSans.className}>
        <SessionProvider>
          <ThemeProvider>
            <NotificationProvider>
              {children}
            </NotificationProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
