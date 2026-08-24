"use client";

import React, { useState } from "react";
import { Image as ImageIcon } from "lucide-react";

interface SafeImageProps {
  src: string;
  alt: string;
  style?: React.CSSProperties;
}

export default function SafeImage({ src, alt, style }: SafeImageProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    return (
      <div 
        style={{ 
          ...style, 
          background: "var(--card-border)", 
          display: "flex", 
          flexDirection: "column",
          alignItems: "center", 
          justifyContent: "center",
          color: "var(--foreground)",
          gap: "0.5rem"
        }}
      >
        <ImageIcon size={32} opacity={0.3} />
        <span style={{ fontSize: "0.75rem", opacity: 0.5, fontWeight: 500 }}>Mídia Expirada</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      style={style}
      onError={() => setHasError(true)}
    />
  );
}
