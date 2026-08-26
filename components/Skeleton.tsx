"use client";

import React from "react";
import { motion } from "framer-motion";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ width = "100%", height = "100%", borderRadius = "8px", className = "", style = {} }: SkeletonProps) {
  return (
    <motion.div
      initial={{ opacity: 0.5 }}
      animate={{ opacity: 1 }}
      transition={{
        repeat: Infinity,
        repeatType: "mirror",
        duration: 1,
        ease: "easeInOut"
      }}
      className={`skeleton-base ${className}`}
      style={{
        width,
        height,
        borderRadius,
        background: "rgba(255, 255, 255, 0.05)",
        ...style
      }}
    />
  );
}

export function SkeletonCircle({ size = "40px", className = "", style = {} }: { size?: string | number; className?: string; style?: React.CSSProperties }) {
  return (
    <Skeleton 
      width={size} 
      height={size} 
      borderRadius="50%" 
      className={className} 
      style={style} 
    />
  );
}
