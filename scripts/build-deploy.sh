#!/usr/bin/env bash
#
# Monta o pacote que sobe para a hospedagem.
#
# O build acontece AQUI, nunca no servidor: a conta compartilhada tem 1 núcleo,
# 2 GB de RAM e teto de 5 MB/s de E-S com 1.024 IOPS. `next build` e
# `npm install` nessas condições levam o tempo que quiserem, quando terminam.
# O que viaja é o resultado — `deploy/` só precisa de um Node para executar.
#
# Uso: ./scripts/build-deploy.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

SAIDA="deploy"

echo "==> Limpando pacote anterior"
rm -rf "$SAIDA"

echo "==> Gerando o cliente do Prisma (com os motores da hospedagem)"
npx prisma generate

echo "==> Build do Next"
npm run build

echo "==> Montando $SAIDA/"
cp -r .next/standalone "$SAIDA"

# `server.js` serve `public` e `.next/static` sozinho, mas só se eles estiverem
# ao lado dele — o build não os copia. Sem este passo o site sobe sem CSS e sem
# imagem, que é a falha mais fácil de cometer e a mais confusa de diagnosticar.
cp -r public "$SAIDA/public"
mkdir -p "$SAIDA/.next"
cp -r .next/static "$SAIDA/.next/static"

# O schema viaja junto para que `prisma migrate deploy` e `db push` possam ser
# rodados de lá, se um dia precisarem.
mkdir -p "$SAIDA/prisma"
cp prisma/schema.prisma "$SAIDA/prisma/schema.prisma"

# O rastreamento do Next nem sempre leva o motor de consulta do Prisma junto.
# Conferir aqui é barato; descobrir em produção é o site fora do ar.
echo "==> Conferindo os motores do Prisma no pacote"
if ! find "$SAIDA" -name "libquery_engine*" -o -name "query-engine*" | grep -q .; then
  echo "    Motor não rastreado — copiando à mão"
  mkdir -p "$SAIDA/node_modules/.prisma/client"
  cp -r node_modules/.prisma/client/. "$SAIDA/node_modules/.prisma/client/"
fi
echo "==> Enxugando o pacote"

# O `sharp` que o rastreamento traz é o binário DESTA máquina (macOS/arm64), que
# no servidor Linux não serve para nada. Ele só existe porque o Next o lista
# como dependência opcional do otimizador de imagens — e `next/image` não é
# usado em nenhuma tela deste projeto. Se um dia passar a ser, apague estas
# linhas e resolva o binário de Linux, senão a otimização quebra em produção.
rm -rf "$SAIDA/node_modules/@img" "$SAIDA/node_modules/sharp"

# O motor do Prisma desta máquina. O servidor é Linux; levá-lo é carregar 18 MB
# que nunca serão abertos.
#
# Removê-lo, porém, deixa o pacote impossível de exercitar aqui: `server.js`
# sobe e serve HTML, mas qualquer tela que toque o banco morre com "could not
# locate the Query Engine for runtime darwin-arm64" — ruído local, não defeito
# do pacote. Para um teste de verdade antes de publicar:
#
#   MANTER_MOTOR_LOCAL=1 ./scripts/build-deploy.sh
#   cd deploy && PORT=3101 node --env-file=../.env --env-file=../.env.local server.js
#
# O pacote que sobe para a hospedagem é o do modo padrão.
if [ "${MANTER_MOTOR_LOCAL:-0}" = "1" ]; then
  echo "    MANTER_MOTOR_LOCAL=1 — motor do macOS preservado (pacote de TESTE, não publique)"
else
  find "$SAIDA" -name "libquery_engine-darwin*" -delete
fi

# Os motores WASM dos bancos que este projeto não usa. O datasource é MySQL, e
# cada um destes pesa ~3 MB em duas cópias. O do MySQL fica.
find "$SAIDA" -name "query_engine_bg.*.wasm-base64.*" \
  ! -name "*mysql*" -delete

# O `.env` que o `next build` copia para dentro do standalone.
#
# Ele não pode viajar: na hospedagem as variáveis moram no painel do Node, e o
# `DATABASE_URL` de lá é OUTRO — aponta para `localhost`, que é o ganho inteiro
# da mudança. Um `.env` no pacote sobrescreveria isso em silêncio, devolvendo os
# 180 ms por consulta que viemos eliminar.
#
# E como este pacote é versionado num branch, levá-lo seria publicar a senha do
# MySQL no GitHub.
rm -f "$SAIDA"/.env "$SAIDA"/.env.*

# Rede de segurança: o pacote vai para um repositório, e um segredo que escapa
# daqui não volta. Falhar o build é barato perto de rotacionar credencial.
if find "$SAIDA" -name ".env" -o -name ".env.*" | grep -q .; then
  echo "ERRO: sobrou arquivo .env no pacote:" >&2
  find "$SAIDA" -name ".env" -o -name ".env.*" >&2
  exit 1
fi

echo "==> Motores que vão no pacote:"
find "$SAIDA" -name "libquery_engine*" -exec basename {} \; | sort -u | sed 's/^/    /'

echo
echo "==> Pronto. Tamanho do pacote:"
du -sh "$SAIDA"
echo
echo "Sobe o conteúdo de $SAIDA/ para a pasta do app no cPanel."
echo "Arquivo de inicialização do Node: server.js"
