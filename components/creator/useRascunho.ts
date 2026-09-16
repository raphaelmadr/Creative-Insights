"use client";

import { useState } from "react";

/**
 * O estado de um formulário que só vai ao banco quando alguém manda.
 *
 * Nasceu de uma perda de dado real. Os diálogos de configuração gravavam a cada
 * clique, e cada clique montava o corpo da requisição a partir das PROPRIEDADES
 * — que só mudam depois de o quadro inteiro recarregar, coisa de alguns
 * segundos. Marcar duas pessoas seguidas num grupo mandava, no segundo clique,
 * uma lista que ainda não tinha a primeira: a primeira era desfeita sem aviso,
 * e quem clicou só descobria ao reabrir a tela.
 *
 * Com um rascunho, a fonte da verdade enquanto a tela está aberta é local: o
 * segundo clique parte do primeiro, não de uma cópia velha do servidor. E a
 * gravação deixa de ser um efeito colateral de cada clique para virar um ato —
 * com botão, com hora e com como desistir.
 *
 * `doServidor` é relido só na ABERTURA. Durante a edição ele é ignorado de
 * propósito: é o que impede a conferência periódica do quadro de apagar o que
 * está sendo escrito naquele instante.
 */
export function useRascunho<T>(open: boolean, doServidor: T) {
  const [draft, setDraft] = useState<T>(doServidor);
  /** O que está gravado — a régua para saber se há algo a salvar. */
  const [gravado, setGravado] = useState<T>(doServidor);
  const [estavaAberto, setEstavaAberto] = useState(open);

  /*
   * Ajuste na renderização, e não num efeito: assim o rascunho já nasce certo
   * no primeiro quadro desenhado, em vez de aparecer com o valor velho e ser
   * corrigido logo depois.
   */
  if (open !== estavaAberto) {
    setEstavaAberto(open);
    if (open) {
      setDraft(doServidor);
      setGravado(doServidor);
    }
  }

  /**
   * Comparação pelo conteúdo, não pela identidade.
   *
   * As propriedades chegam como objetos novos a cada renderização do quadro;
   * comparar referências acusaria alteração pendente em toda tela aberta, e o
   * aviso de "há mudanças não salvas" perderia o sentido por gritar sempre.
   */
  const sujo = JSON.stringify(draft) !== JSON.stringify(gravado);

  /** O servidor confirmou: este passa a ser o estado gravado. */
  const adotar = (novo: T) => {
    setDraft(novo);
    setGravado(novo);
  };

  return { draft, setDraft, sujo, adotar };
}
