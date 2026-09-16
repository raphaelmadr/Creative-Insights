# Publicar na hospedagem (cPanel)

Procedimento para tirar o sistema da Vercel e rodá-lo no cPanel, na mesma
máquina do MySQL.

## Por que cPanel, e não um VPS

A motivação nunca foi custo: foi **latência**. Medido em 14/09/2026, e conferido
em 16/09: cada ida-e-volta ao MySQL de `192.109.11.49` custa **~180 ms**. O sync
grava 7.642 métricas com concorrência 5, o que dá ~272 s só de espera de rede,
de um total de 288 s — **95% do tempo é rede**.

Rodar o app na mesma máquina do banco derruba isso para ~1 ms por consulta. Um
VPS novo só entrega esse ganho se o banco for junto; o cPanel entrega o mesmo
resultado sem migrar dado nenhum e sem uma segunda conta, porque o banco **já
está lá**.

O preço é o teto da conta compartilhada: 2 GB de RAM, 1 núcleo, 20 processos de
entrada e **5 MB/s de E-S com 1.024 IOPS**. É esse teto que decide tudo o que
vem abaixo.

## A regra que organiza o resto: o servidor não constrói

`npm install` e `next build` não rodam na hospedagem. Com 1 núcleo e 5 MB/s, o
install de ~700 MB leva o tempo que quiser e o build provavelmente não termina.

Quem constrói é o GitHub. Você dá push na `main`, como sempre; a esteira em
`.github/workflows/deploy.yml` builda no runner e publica o resultado no branch
**`deploy`**, que é o que a hospedagem espelha. A `main` nunca recebe binário,
e publicar não depende de estar na máquina certa.

Para rodar o mesmo build localmente, quando precisar inspecionar o pacote:

```bash
./scripts/build-deploy.sh
```

O script gera `deploy/` — `server.js`, os arquivos de `node_modules` que as
rotas realmente alcançam, `public` e `.next/static`. O servidor só executa.

### O que o script corta, e por quê

| Corte | Peso | Razão |
|---|---|---|
| `@img` / `sharp` | 16 MB | Binários de macOS, inúteis no Linux. `next/image` não é usado em nenhuma tela — confirmado no manifesto do build. **Se passar a ser usado, isto quebra:** resolva o binário de Linux antes. |
| Motor Prisma `darwin` | 18 MB | O servidor é Linux. |
| Motores WASM não-MySQL | 46 MB | Postgres, SQL Server, CockroachDB e SQLite, em duas cópias. O datasource é MySQL. |

Resultado: 222 MB → **142 MB**.

Dos 142 MB restantes, 38 MB são **dois** motores do Prisma (`rhel-openssl-1.1.x`
e `rhel-openssl-3.0.x`), porque a distro do servidor ainda não foi confirmada.
Sabendo qual é, apague o outro de `prisma/schema.prisma` e o pacote cai para
~123 MB. Para descobrir, no Terminal do cPanel:

```bash
cat /etc/os-release && openssl version
```

## Variáveis de ambiente

Todas as 17 do `.env`/`.env.local` precisam ser recriadas no painel do Node.
Três **mudam** em relação à Vercel:

| Variável | Valor na hospedagem | Por quê |
|---|---|---|
| `DATABASE_URL` | host `localhost` no lugar de `192.109.11.49` | É o ganho todo. Mesmo banco, mesma máquina — sem isso, a mudança não serve para nada. |
| `NEXTAUTH_URL` | o domínio público, com `https://` | Hoje está vazia, e em produção o NextAuth caía em `VERCEL_PROJECT_PRODUCTION_URL`, que não existe fora da Vercel. Sem ela, o login para. |
| `NEXTAUTH_SECRET` | o valor real | Havia um fallback **escrito no `next.config.ts`**, versionado no Git. Foi removido. Se esta variável faltar, o NextAuth falha — e falhar alto é melhor que assinar sessão com segredo público. |

O domínio **não muda**, então o `redirect_uri` autorizado no cliente OAuth do
Google continua valendo. Nada a fazer no console do Google.

## Configurar o app no cPanel

Em *Setup Node.js App*:

- **Node**: 20.19.4 (disponível na conta; Next 16 exige >= 20.9.0)
- **Application root**: a pasta onde o `deploy/` foi publicado
- **Application startup file**: `server.js`
- **Application URL**: o domínio

O Passenger injeta `PORT`, e o `server.js` do Next o respeita.

## Crons

Nada de novo a cadastrar para o sync: `/api/cron/sync-all` já está registrado e
continua valendo — uma batida alterna entre métricas e mídia.

Falta migrar **um**, o que hoje vive no `vercel.json`:
`/api/insights/news/cron`, diário à meia-noite.

`vercel.json` só deve ser apagado **depois** do corte, não antes.

## O corte

1. Publicar e testar pelo endereço temporário do cPanel, com o DNS ainda na Vercel
2. Conferir o login (é o que mais depende de configuração nova)
3. Rodar um sync e comparar o tempo — a prova de que a co-locação funcionou
4. Só então apontar o DNS
5. Depois de estável: apagar `vercel.json` e o cron da Vercel

## Riscos ainda não medidos

- **Progresso ao vivo.** `/api/sync-all` e `/api/insights/news` usam
  `ReadableStream`. Apache/Passenger pode bufferizar a resposta e engolir o
  progresso na tela. Não afeta o cron, que não usa stream. Testar depois de subir.
- **E-S em lote.** O teto de 1.024 IOPS é a suspeita principal para as falhas
  antigas de upload em lote, e continua de pé.
- **1 núcleo para SSR.** Nunca foi medido com o app servindo tela. É o motivo
  para fazer o corte por DNS, que se desfaz em minutos.
