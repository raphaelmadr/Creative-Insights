"use client";

import React from "react";
import { type CardLabel } from "@/lib/kanban";

/**
 * A etiqueta como ela aparece no card.
 *
 * Existe como componente, e não como um `span` copiado, porque ela é desenhada
 * em dois lugares — no quadro e na prévia da tela de configuração — e uma
 * prévia que não é a coisa real não serve para decidir cor nenhuma.
 */
export default function CardLabelChip({ label }: { label: CardLabel }) {
  return (
    <span
      className="card-badge card-label"
      title={`${label.name} — quando "${label.fieldKey}" contém ${label.match.join(", ")}`}
      style={{ "--label-color": label.color } as React.CSSProperties}
    >
      {label.name}
    </span>
  );
}
