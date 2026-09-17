/**
 * O anexo de referência, a caminho do servidor externo.
 *
 * O arquivo não fica no banco nem no sistema de arquivos da aplicação: vai para
 * o mesmo cPanel que guarda a arte dos criativos, e o card guarda a URL. É a
 * infraestrutura que já existe, já está paga e já é servida por HTTPS — montar
 * um segundo armazenamento para o que é, no fim, mais uma imagem seria inventar
 * um problema de operação que ninguém tem hoje.
 *
 * O upload passa pelo servidor, e não direto do navegador, porque o segredo do
 * cPanel é um só: entregá-lo ao cliente seria publicar a chave de escrita do
 * armazenamento para qualquer pessoa com o painel aberto.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentCreator } from "@/lib/auth";
import { CREATOR_ONLY_ERROR } from "@/lib/roles";
import { resolveStorageConfig, isStorageConfigured, uploadToStorage } from "@/lib/media-upload";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPES,
  attachmentExtension,
  formatBytes,
  storageFilename,
  type CardAttachment,
} from "@/lib/attachments";

export async function POST(request: Request) {
  const user = await getCurrentCreator();
  if (!user) return NextResponse.json({ error: CREATOR_ONLY_ERROR }, { status: 403 });

  try {
    const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
    const config = resolveStorageConfig(settings);

    if (!isStorageConfigured(config)) {
      return NextResponse.json(
        { error: "O armazenamento externo não está configurado. Veja Configurações → Sistema." },
        { status: 400 }
      );
    }

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }

    /*
     * O tipo é conferido aqui e não só no navegador: o `accept` do campo de
     * arquivo é sugestão, não trava — o seletor do sistema deixa escolher
     * "todos os arquivos". E o que o handler do cPanel faz com o que não
     * reconhece é pior do que recusar: renomeia para `.jpg` e responde sucesso.
     */
    if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.type)) {
      return NextResponse.json(
        {
          error:
            "Só imagem por enquanto (JPG, PNG, WEBP ou GIF). O servidor de arquivos não guarda outros formatos.",
        },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "O arquivo está vazio." }, { status: 400 });
    }

    if (file.size > ATTACHMENT_MAX_BYTES) {
      return NextResponse.json(
        {
          error: `O arquivo tem ${formatBytes(file.size)} e o limite é ${formatBytes(ATTACHMENT_MAX_BYTES)}.`,
        },
        { status: 400 }
      );
    }

    const filename = storageFilename(file.name, file.type);
    const url = await uploadToStorage(file, filename, config, "subir o anexo de uma demanda");

    if (!url) {
      /*
       * A causa já foi registrada em Configurações → Logs por `uploadToStorage`
       * — cota cheia, limite de requisições, host fora do ar. A mensagem aqui
       * diz onde procurar, em vez de repetir um detalhe técnico no meio do
       * formulário de quem só queria anexar um print.
       */
      return NextResponse.json(
        { error: "O servidor de arquivos recusou o envio. O motivo está em Configurações → Logs." },
        { status: 502 }
      );
    }

    const attachment: CardAttachment = {
      url,
      // O nome original é o que a pessoa reconhece; o nome gravado no servidor é
      // único e ilegível de propósito, e não serve para ninguém ler.
      name: file.name.slice(0, 160) || `referencia.${attachmentExtension(file.type)}`,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, attachment });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
