import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * O pacote que sobe para a hospedagem.
   *
   * `standalone` faz o build emitir `.next/standalone` com um `server.js` e só
   * os arquivos de `node_modules` que as rotas realmente alcançam. É o que
   * torna o cPanel viável: a conta compartilhada tem 1 núcleo e teto de 5 MB/s
   * de E-S, onde um `npm install` de 700 MB leva o tempo que quiser e um
   * `next build` provavelmente nem termina. Buildando aqui e subindo pronto,
   * o servidor só executa.
   *
   * `server.js` não copia `public` nem `.next/static` sozinho — quem faz isso
   * é `scripts/build-deploy.sh`, e sem esse passo o site sobe sem CSS.
   */
  output: "standalone",

  /*
   * O IP da máquina de desenvolvimento muda conforme a rede; ajuste quando o
   * `next dev` reclamar de origem não permitida.
   */
  allowedDevOrigins: ["192.168.103.116", "192.168.102.36", "localhost"],

  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
