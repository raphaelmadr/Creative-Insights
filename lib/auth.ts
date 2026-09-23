/**
 * Configuração de autenticação e quem é a pessoa por trás da requisição.
 *
 * As opções viviam dentro do handler de rota, que é o único lugar onde o
 * Next.js não permite importá-las de volta: qualquer rota que precisasse saber
 * quem está autenticado teria de repetir a configuração inteira. Ficam aqui, e
 * o handler passa a ser só o handler.
 */

import { NextAuthOptions, getServerSession } from "next-auth";
import { ALLOWED_EMAIL_DOMAIN } from "./corporate-email";
import { hasCreatorAccess, isAdminRole, type UserRole } from "./roles";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "@/lib/prisma";
import { ensureAuthUrlEnv } from "@/lib/auth-url";
import { configuracaoDaAutenticacao } from "@/lib/auth-settings";
import { DEV_USER_EMAIL } from "@/lib/dev-user";

/*
 * O vocabulário dos papéis mora em `lib/roles.ts`, que é um módulo puro.
 * Reexportado aqui porque este continua sendo o endereço que as rotas conhecem
 * — e porque um componente de cliente não pode importar deste arquivo, que
 * carrega Prisma e NextAuth junto.
 */
export { isAdminRole, hasCreatorAccess };
export type { UserRole };

export interface CurrentUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: UserRole;
}

export async function getAuthOptions(): Promise<NextAuthOptions> {
  /*
   * Antes de qualquer coisa: fixar o endereço público de retorno. Sem isso o
   * NextAuth monta o `redirect_uri` com o domínio do deploy, que muda a cada
   * publicação, e o Google recusa com `redirect_uri_mismatch`.
   */
  await ensureAuthUrlEnv();

  const settings = await configuracaoDaAutenticacao();

  return {
    adapter: PrismaAdapter(prisma),
    providers: [
      GoogleProvider({
        clientId: settings?.googleClientId || process.env.GOOGLE_CLIENT_ID || "",
        clientSecret: settings?.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET || "",
      }),
      ...(process.env.NODE_ENV === "development"
        ? [
            CredentialsProvider({
              name: "Bypass Local",
              credentials: {},
              async authorize() {
                /*
                 * O atalho de desenvolvimento precisa existir no banco, e não
                 * apenas no token: presença, preferências e papel são lidos da
                 * tabela `User`, então um usuário que só existe no JWT
                 * apareceria sem papel e sem preferências — e o painel local
                 * ficaria trancado para quem está justamente desenvolvendo-o.
                 */
                const email = DEV_USER_EMAIL;
                const user = await prisma.user.upsert({
                  where: { email },
                  update: {},
                  create: { email, name: "Dev User", role: "ADMIN" },
                });
                return { id: user.id, name: user.name, email: user.email };
              },
            }),
          ]
        : []),
    ],
    secret: settings?.nextAuthSecret || process.env.NEXTAUTH_SECRET || "fallback_secret_for_dev_only_12345",
    session: {
      strategy: "jwt",
    },
    callbacks: {
      async signIn({ user }) {
        if (user.email && user.email.endsWith(ALLOWED_EMAIL_DOMAIN)) {
          return true;
        }
        return "/login?error=AccessDenied"; // Redireciona de volta para login com erro
      },

      /**
       * Identidade e papel são lidos do banco a cada sessão, não gravados no
       * token. Um papel carimbado no JWT só mudaria no próximo login: promover
       * alguém a admin não teria efeito enquanto a aba estivesse aberta, e
       * rebaixar alguém tampouco — o que é pior. Custa uma consulta por
       * verificação de sessão e mantém a permissão sempre sendo a atual.
       */
      async session({ session }) {
        if (!session.user?.email) return session;

        const user = await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true, role: true, image: true },
        });

        if (user) {
          session.user.id = user.id;
          session.user.role = (user.role as UserRole) || "MEMBER";
          if (user.image) session.user.image = user.image;
        }

        return session;
      },
    },
    pages: {
      signIn: "/login",
      error: "/login",
    },
  };
}

/**
 * A pessoa autenticada nesta requisição, com o papel vindo do banco.
 *
 * Devolve `null` quando não há sessão, ou quando o e-mail da sessão não
 * corresponde a nenhum usuário — um token velho de alguém removido não deve
 * valer como acesso.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getServerSession(await getAuthOptions());
  if (!session?.user?.email) return null;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, email: true, image: true, role: true },
  });

  if (!user?.email) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: (user.role as UserRole) || "MEMBER",
  };
}

/**
 * A pessoa autenticada, desde que seja admin. `null` cobre os dois casos —
 * não autenticada e sem permissão —, que do ponto de vista da rota levam à
 * mesma resposta.
 */
export async function getCurrentAdmin(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user && isAdminRole(user.role) ? user : null;
}

/**
 * A pessoa autenticada, desde que alcance o modo Creator — o board e a copy.
 *
 * Existe pela mesma razão de `getCurrentAdmin`: a rota não deve conhecer quais
 * papéis passam, só perguntar se este passa. No dia em que houver um quarto
 * papel, nenhuma rota muda.
 *
 * Não cobre a ABERTURA de demanda, que é de qualquer pessoa autenticada e mora
 * em `/api/demanda` — ver `lib/demanda-intake.ts`.
 */
export async function getCurrentCreator(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user && hasCreatorAccess(user.role) ? user : null;
}

/**
 * O e-mail de quem está usando o sistema, em minúsculas — ou `null`.
 *
 * É a identidade que o quadro usa para dizer quem assume uma demanda. Foi
 * sigla de criador por um tempo, e isso excluía do quadro todo mundo que não
 * desenha peça: mídia paga, conteúdo, revisão. `Creator` voltou ao seu assunto,
 * que é atribuir criativos a quem os assina.
 */
export async function getCurrentUserEmail(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.email?.trim().toLowerCase() || null;
}
