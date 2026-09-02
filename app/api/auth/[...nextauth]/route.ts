import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "@/lib/prisma";

async function getAuthOptions(): Promise<NextAuthOptions> {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });

  return {
    adapter: PrismaAdapter(prisma),
    providers: [
      GoogleProvider({
        clientId: settings?.googleClientId || process.env.GOOGLE_CLIENT_ID || "",
        clientSecret: settings?.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET || "",
      }),
    ],
    secret: settings?.nextAuthSecret || process.env.NEXTAUTH_SECRET || "fallback_secret_for_dev_only_12345",
    session: {
      strategy: "jwt",
    },
    callbacks: {
      async signIn({ user }) {
        if (user.email && user.email.endsWith("@allugator.com")) {
          return true;
        }
        return "/login?error=AccessDenied"; // Redireciona de volta para login com erro
      },
    },
    pages: {
      signIn: "/login",
      error: "/login"
    }
  };
}

const handler = async (req: Request, context: any) => {
  const options = await getAuthOptions();
  return NextAuth(req, context, options);
};

export { handler as GET, handler as POST };
