"use client";

/**
 * A marca, disponível para quem desenha — sem uma segunda busca.
 *
 * O cabeçalho, o login e o formulário público são componentes de cliente e não
 * podem ler o banco. Poderiam pedir a marca a uma rota, mas seria uma
 * requisição por visita para trazer duas linhas de texto que o servidor já
 * tinha em mãos ao montar a página: o `layout` lê uma vez e reparte daqui.
 */

import { createContext, useContext, type ReactNode } from "react";
import { MARCA_PADRAO, type Marca } from "@/lib/branding";

const MarcaContext = createContext<Marca>(MARCA_PADRAO);

export function BrandingProvider({ marca, children }: { marca: Marca; children: ReactNode }) {
  return <MarcaContext.Provider value={marca}>{children}</MarcaContext.Provider>;
}

/** A marca configurada. Fora do provedor, devolve a padrão em vez de quebrar. */
export function useMarca(): Marca {
  return useContext(MarcaContext);
}

/**
 * O logotipo nas duas versões, que é como ele aparece em toda tela.
 *
 * As duas imagens vão juntas e o CSS mostra a do tema (`.logo-light` /
 * `.logo-dark`): a troca é instantânea e não pisca, o que uma decisão em
 * JavaScript não garante — o tema é conhecido antes de o React montar.
 */
export function Logotipo({ altura = 32 }: { altura?: number }) {
  const marca = useMarca();
  const medida = { height: `${altura}px`, width: "auto" } as const;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={marca.logo} alt={marca.nome} className="logo-light" style={medida} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={marca.logoEscuro} alt={marca.nome} className="logo-dark" style={medida} />
    </>
  );
}
