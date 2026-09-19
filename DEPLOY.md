# Publicar na hospedagem (cPanel)

O sistema roda no cPanel, na mesma máquina do MySQL. Este é o procedimento de
publicação e a configuração que ele exige.

## Por que cPanel, e não um VPS

A motivação nunca foi custo: foi **latência**. Medido em 14/09/2026, e conferido
em 16/09: cada ida-e-volta ao MySQL remoto custava **~180 ms**. O sync grava
7.642 métricas com concorrência 5, o que dava ~272 s só de espera de rede, de um
total de 288 s — **95% do tempo era rede**.

Rodar o app na mesma máquina do banco derruba isso para ~1 ms por consulta. Um
VPS novo só entregaria esse ganho se o banco fosse junto; o cPanel entrega o
mesmo resultado sem migrar dado nenhum e sem uma segunda conta, porque o banco
**já está lá**.

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

Todas as 17 do `.env`/`.env.local` precisam existir no painel do Node. Três
merecem atenção:

| Variável | Valor na hospedagem | Por quê |
|---|---|---|
| `DATABASE_URL` | host `localhost` | É o ganho todo. Mesmo banco, mesma máquina — sem isso, a co-locação não serve para nada. |
| `NEXTAUTH_URL` | o domínio público, com `https://` | Sem ela o NextAuth monta o `redirect_uri` a partir de um endereço adivinhado e o Google recusa o login com `redirect_uri_mismatch`. É também o que fixa a URL do disparador de cron quando o painel é aberto fora do domínio de produção. |
| `NEXTAUTH_SECRET` | o valor real | Havia um fallback **escrito no `next.config.ts`**, versionado no Git. Foi removido. Se esta variável faltar, o NextAuth falha — e falhar alto é melhor que assinar sessão com segredo público. |

O `redirect_uri` autorizado no cliente OAuth do Google precisa ser exatamente
`<domínio>/api/auth/callback/google`. A tela `/api/auth/config-check` responde
qual endereço o sistema está usando e o que falta.

## Configurar o app no cPanel

Em *Setup Node.js App*:

- **Node**: 20.19.4 (disponível na conta; Next 16 exige >= 20.9.0)
- **Application root**: a pasta onde o `deploy/` foi publicado
- **Application startup file**: `server.js`
- **Application URL**: o domínio

O Passenger injeta `PORT`, e o `server.js` do Next o respeita.

## Cron: um cadastro só

A sincronização automática depende de **um** Cron Job no cPanel, batendo a cada
3 minutos. Ele não decide nada: só acorda a aplicação. Quem decide se há
sincronização e com que frequência é Configurações › Sistema, e por isso mudar o
intervalo no painel vale na hora, sem tocar no servidor. A maioria das batidas
não faz nada além de checar se a janela do intervalo já venceu.

Cada batida elegível executa as **duas** passadas — métricas e mídia —, em
sequência, sob a mesma trava. Isso deixou de ser um problema quando o teto de
300s da função serverless saiu de cena (ver changelog); a única regra que
sobrou é o passo do disparador ser no máximo a metade do intervalo escolhido no
painel, para nunca perder uma janela por atraso de relógio — 3 min cobre com
folga qualquer intervalo do seletor (mínimo 15 min).

1. Abra **Configurações › Sistema** no domínio de produção
2. No cartão "Disparador externo", copie o comando — já vem pronto, sem nada a gerar
3. No cPanel, em *Cron Jobs*, cadastre-o com a frequência `*/3 * * * *`

**O endpoint não cobra credencial.** Não há segredo para vencer, rotacionar ou
desatualizar entre o painel e o cPanel — a mesma classe de falha ("comando
colado com a chave antiga") que já causou incidente aqui deixou de existir. A
proteção real é o próprio portão de intervalo: uma batida sem `?force=1` nunca
faz a aplicação chamar Meta ou TikTok fora da janela que o painel define, então
descobrir a URL não dá a ninguém mais do que o próprio cron já tem.

**Como saber se está de pé.** O mesmo cartão mostra *Última batida do
disparador*. Esse carimbo é gravado assim que uma requisição chega — antes de
qualquer decisão de intervalo —, então ele prova que o cadastro no cPanel está
vivo, independente de a batida ter rodado passada ou só respondido "fora da
janela". Mais de 15 minutos sem batida, com o cron a cada 3 min, já são cinco
batidas perdidas: o painel acusa.

Para testar na hora, sem esperar a janela: acrescente `?force=1` à URL, ou
`?job=media` para forçar a passada de artes.

## Publicar uma versão nova

1. `git push` na `main` — a esteira do GitHub builda e publica no branch `deploy`
2. A hospedagem espelha o `deploy`
3. Reinicie a aplicação no *Setup Node.js App* (ou toque `tmp/restart.txt`)

## Riscos ainda não medidos

- **Progresso ao vivo.** `/api/sync-all` e `/api/insights/news` usam
  `ReadableStream`. Apache/Passenger pode bufferizar a resposta e engolir o
  progresso na tela. Não afeta o cron, que não usa stream. Testar depois de subir.
- **E-S em lote.** O teto de 1.024 IOPS é a suspeita principal para as falhas
  antigas de upload em lote, e continua de pé.
- **1 núcleo para SSR.** Nunca foi medido com o app servindo tela. É o motivo
  para fazer o corte por DNS, que se desfaz em minutos.
