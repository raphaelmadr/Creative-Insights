import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const isAuthenticated = !!req.nextauth.token;

    if (!isAuthenticated) {
      // Return JSON 401 for API routes instead of redirecting to login page
      if (req.nextUrl.pathname.startsWith("/api/")) {
        return new NextResponse(JSON.stringify({ error: "Unauthorized" }), { 
          status: 401, 
          headers: { "Content-Type": "application/json" }
        });
      }
      // Redirect to login for page routes
      return NextResponse.redirect(new URL("/login", req.url));
    }
  },
  {
    callbacks: {
      authorized: () => true, // Let the middleware handle authorization manually above
    },
  }
);

export const config = {
  matcher: [
    /*
     * `api/public` e `demanda` ficam de fora da exigência de sessão — é o link
     * aberto de abertura de demandas. Quem protege ali é o token do quadro, na
     * própria rota; ver `app/api/public/demanda/[token]/route.ts`.
     */
    "/((?!api/auth|api/cron|api/public|demanda|_next/static|_next/image|favicon.ico|logo.png|logo-dark.png|login).*)",
  ],
};
