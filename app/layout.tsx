import type { Metadata } from "next";
import { Inter, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import SessionProvider from "@/components/SessionProvider";
import { UserPreferencesProvider } from "@/components/UserPreferencesProvider";
import NotificationProvider from "@/components/NotificationProvider";
import { BrandingProvider } from "@/components/BrandingProvider";
import { lerMarca, MARCA_PADRAO } from "@/lib/branding";

const inter = Inter({
  subsets: ["latin"],
  // O nome da variável não cita a fonte: assim uma troca futura mexe só aqui,
  // e não no `globals.css`.
  variable: "--font-sans-family",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});

/*
 * O título e o ícone saem do banco, não do código.
 *
 * `generateMetadata` em vez do objeto fixo porque o nome é configurável e
 * precisa valer para o sistema inteiro — inclusive na aba do navegador, que é
 * onde a marca aparece mesmo quando a página está em segundo plano.
 */
export async function generateMetadata(): Promise<Metadata> {
  const marca = await lerMarca();
  return {
    title: marca.nome,
    description: "Dashboard de Performance Criativa",
    /* O logotipo serve de ícone da aba quando há um configurado. */
    icons: marca.logo !== MARCA_PADRAO.logo ? { icon: marca.logo } : undefined,
  };
}

/*
 * Nada de página estática daqui para baixo.
 *
 * Com prerender, o nome e o logotipo seriam gravados no HTML no momento da
 * PUBLICAÇÃO, e trocar a marca no painel não mudaria nada até o próximo deploy
 * — que é exatamente o que este trabalho existe para evitar. As telas afetadas
 * (home, equipe, insights, login) já buscam tudo o que mostram no cliente, e
 * portanto não ganhavam nada em ser estáticas.
 */
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const marca = await lerMarca();

  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${bricolage.variable}`}
      suppressHydrationWarning
    >
      <body className={inter.className}>
        <SessionProvider>
          <UserPreferencesProvider>
            <BrandingProvider marca={marca}>
              <NotificationProvider>
                {children}
              </NotificationProvider>
            </BrandingProvider>
          </UserPreferencesProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
