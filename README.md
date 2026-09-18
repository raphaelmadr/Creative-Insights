# Creative Insights

Painel de performance criativa da allu.mkt: lê Meta Ads e TikTok Ads, guarda
métricas diárias por anúncio e organiza as peças em categorias de desempenho.

## Rodar localmente

```bash
npm install
npm run dev
```

O painel sobe em [http://localhost:3000](http://localhost:3000). O banco é o
mesmo de produção — não há base separada de desenvolvimento, por decisão do
dono: os dados custaram caro nas APIs.

Um script do Prisma não sobe com o `npm run dev` no ar; o banco compartilhado
tem teto de conexões. Pare o servidor antes, ou use a própria API do painel.

## Publicar

A aplicação roda numa **hospedagem cPanel**, na mesma máquina do MySQL. O
servidor não constrói: o GitHub builda e publica o resultado no branch `deploy`,
que a hospedagem espelha. O procedimento inteiro — variáveis de ambiente,
configuração do Node, Cron Jobs — está em [DEPLOY.md](DEPLOY.md).

## Documentos

- [DEPLOY.md](DEPLOY.md) — publicar, variáveis e o disparador da sincronização.
- [CHANGELOG.md](CHANGELOG.md) — o que mudou e, principalmente, por quê.
- [AGENTS.md](AGENTS.md) — instruções para agentes que editam este repositório.
