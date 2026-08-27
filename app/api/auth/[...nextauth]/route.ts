import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function getAuthOptions(): Promise<NextAuthOptions> {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });

  return {
    providers: [
      GoogleProvider({
        clientId: settings?.googleClientId || process.env.GOOGLE_CLIENT_ID || "",
        clientSecret: settings?.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET || "",
      }),
    ],
    secret: settings?.nextAuthSecret || process.env.NEXTAUTH_SECRET || "",
    callbacks: {
      async signIn({ user }) {
        // Restrict login to @allugator.com emails
        if (user.email && user.email.endsWith("@allugator.com")) {
          return true;
        }
        return false; // Return false to display a default error message
      },
    },
    pages: {}
  };
}

const handler = async (req: Request, context: any) => {
  const options = await getAuthOptions();
  return NextAuth(req, context, options);
};

export { handler as GET, handler as POST };
