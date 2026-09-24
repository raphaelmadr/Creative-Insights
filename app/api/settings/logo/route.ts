/**
 * O logotipo, a caminho do servidor de arquivos.
 *
 * Mesma infraestrutura da arte dos criativos e dos anexos de demanda — ver
 * `app/api/creator/attachments`. Podia-se pedir uma URL colada à mão, e o campo
 * continua aceitando uma; mas trocar a marca é tarefa de quem administra o
 * painel, não de quem tem onde hospedar imagem, e obrigar a segunda coisa
 * deixaria a configuração inutilizável para metade de quem precisa dela.
 *
 * Devolve só a URL: quem grava é a rota de configurações, no mesmo "Salvar" do
 * resto da tela. Assim um envio que a pessoa desistiu de salvar não muda a
 * marca de ninguém.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth";
import { resolveStorageConfig, isStorageConfigured, uploadToStorage } from "@/lib/media-upload";
import { storageFilename } from "@/lib/attachments";

export const dynamic = "force-dynamic";

/** Um logotipo é pequeno; o teto existe para barrar engano, não para apertar. */
const LIMITE_BYTES = 2 * 1024 * 1024;

/* SVG fica de fora: o handler do cPanel não o reconhece, e um SVG servido de
   domínio próprio executa script no navegador de quem abre o painel. */
const TIPOS = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function POST(request: Request) {
  if (!(await getCurrentAdmin())) {
    return NextResponse.json({ error: "Só um administrador pode trocar a marca." }, { status: 403 });
  }

  try {
    const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
    const config = resolveStorageConfig(settings);

    if (!isStorageConfigured(config)) {
      return NextResponse.json(
        { error: "O armazenamento externo não está configurado. Veja a seção Armazenamento, aqui mesmo." },
        { status: 400 }
      );
    }

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }
    if (!TIPOS.includes(file.type)) {
      return NextResponse.json({ error: "Use PNG, JPG, WEBP ou GIF." }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "O arquivo está vazio." }, { status: 400 });
    }
    if (file.size > LIMITE_BYTES) {
      return NextResponse.json({ error: "O limite é 2 MB para o logotipo." }, { status: 400 });
    }

    const url = await uploadToStorage(file, storageFilename(file.name, file.type), config, "subir o logotipo");

    if (!url) {
      return NextResponse.json(
        { error: "O servidor de arquivos recusou o envio. O motivo está em Configurações → Logs." },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, url });
  } catch (error) {
    console.error("[Marca] Falha ao subir o logotipo:", error);
    return NextResponse.json({ error: "Não foi possível subir o arquivo." }, { status: 500 });
  }
}
