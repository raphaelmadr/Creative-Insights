"use client";
import React, { useState } from "react";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  isActive?: boolean;
}

export function Avatar({ src, name, size = "md", isActive = true }: AvatarProps) {
  const [imageError, setImageError] = useState(false);

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ").filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getBackgroundColor = (name: string) => {
    const colors = [
      "#7C3AED", "#2563EB", "#059669", "#0D9488",
      "#EA580C", "#4F46E5", "#E11D48", "#DB2777"
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const sizeStyles: Record<string, any> = {
    xs: { width: "24px", height: "24px", fontSize: "10px" },
    sm: { width: "32px", height: "32px", fontSize: "12px" },
    md: { width: "40px", height: "40px", fontSize: "14px" },
    lg: { width: "48px", height: "48px", fontSize: "16px" },
    xl: { width: "64px", height: "64px", fontSize: "20px" },
  };

  const dotStyles: Record<string, any> = {
    xs: { width: "8px", height: "8px", bottom: "0", right: "0", borderWidth: "1px" },
    sm: { width: "10px", height: "10px", bottom: "0", right: "0", borderWidth: "2px" },
    md: { width: "12px", height: "12px", bottom: "0", right: "0", borderWidth: "2px" },
    lg: { width: "14px", height: "14px", bottom: "2px", right: "2px", borderWidth: "2px" },
    xl: { width: "18px", height: "18px", bottom: "4px", right: "4px", borderWidth: "3px" },
  };

  const currentSize = sizeStyles[size];
  const currentDot = dotStyles[size];

  return (
    <div style={{ position: "relative", display: "inline-block", ...currentSize }}>
      <div 
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#ffffff",
          fontWeight: 600,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.15)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          backgroundColor: (!src || imageError) ? getBackgroundColor(name) : "#27272A",
        }}
      >
        {src && !imageError ? (
          <img 
            src={src} 
            alt={name} 
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={() => setImageError(true)}
          />
        ) : (
          <span>{getInitials(name)}</span>
        )}
      </div>
      
      {isActive && (
        <span 
          style={{
            position: "absolute",
            borderRadius: "50%",
            backgroundColor: "var(--primary)",
            borderColor: "var(--background-main)",
            borderStyle: "solid",
            ...currentDot
          }} 
        />
      )}
    </div>
  );
}
