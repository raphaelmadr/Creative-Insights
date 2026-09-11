import type { Metadata } from "next";
import { Inter, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import SessionProvider from "@/components/SessionProvider";
import { UserPreferencesProvider } from "@/components/UserPreferencesProvider";
import NotificationProvider from "@/components/NotificationProvider";
import MuiProvider from "@/components/MuiProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
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
      className={`${inter.variable} ${bricolage.variable}`}
      suppressHydrationWarning
    >
      <body className={inter.className}>
        <SessionProvider>
          <UserPreferencesProvider>
            <MuiProvider>
              <NotificationProvider>
                {children}
              </NotificationProvider>
            </MuiProvider>
          </UserPreferencesProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
