"use client";

import React, { useEffect, useState } from "react";
import { motion, useSpring, useTransform, useMotionValue } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
}

export default function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 1000,
}: AnimatedNumberProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const motionValue = useMotionValue(0);
  
  // Spring config to give it a natural, Apple-like feel
  const springValue = useSpring(motionValue, {
    damping: 30,
    stiffness: 100,
    mass: 0.8,
  });

  useEffect(() => {
    setHasMounted(true);
    motionValue.set(value);
  }, [value, motionValue]);

  const displayValue = useTransform(springValue, (latest) => {
    return (
      prefix +
      latest.toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }) +
      suffix
    );
  });

  // Render static initially for SSR mismatch avoidance
  if (!hasMounted) {
    return (
      <span>
        {prefix}
        {value.toLocaleString("pt-BR", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}
        {suffix}
      </span>
    );
  }

  return <motion.span>{displayValue}</motion.span>;
}
