/**
 * A sessão do next-auth carrega, além do padrão, o id e o papel da pessoa —
 * preenchidos pelo callback `session` em `lib/auth.ts`.
 */
import "next-auth";
import type { UserRole } from "@/lib/auth";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      role?: UserRole;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
