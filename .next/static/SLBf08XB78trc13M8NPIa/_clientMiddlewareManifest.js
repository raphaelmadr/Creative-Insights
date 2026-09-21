self.__MIDDLEWARE_MATCHERS = [
  {
    "regexp": "^(?:\\/(_next\\/data\\/[^/]{1,}))?(?:\\/((?!api\\/auth|api\\/cron|api\\/public|demanda|_next\\/static|_next\\/image|favicon.ico|logo.png|logo-dark.png|login).*))(\\.json|\\.rsc|\\.segments\\/.+\\.segment\\.rsc)?[\\/#\\?]?$",
    "originalSource": "/((?!api/auth|api/cron|api/public|demanda|_next/static|_next/image|favicon.ico|logo.png|logo-dark.png|login).*)"
  }
];self.__MIDDLEWARE_MATCHERS_CB && self.__MIDDLEWARE_MATCHERS_CB()