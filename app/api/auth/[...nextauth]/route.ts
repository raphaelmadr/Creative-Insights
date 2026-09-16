import NextAuth from "next-auth";
import { NextRequest } from "next/server";
import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// As opções vivem em `lib/auth.ts` porque o resto do sistema precisa delas para
// saber quem está autenticado; um arquivo de rota não pode ser importado.
const handler = async (req: NextRequest, context: any) => {
  const options = await getAuthOptions();
  return (NextAuth as any)(req, context, options);
};

export { handler as GET, handler as POST };
