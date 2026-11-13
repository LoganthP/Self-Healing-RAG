import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

interface CountUpProps {
  value: number;
  duration?: number;
  decimals?: number;
  formatter?: (val: number) => string;
}

export function CountUp({ value, duration = 1.0, decimals = 0, formatter }: CountUpProps) {
  const shouldReduceMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(shouldReduceMotion ? value : 0);

  useEffect(() => {
    if (shouldReduceMotion) {
      setDisplayValue(value);
      return;
    }

    let animId: number;
    let startTime: number | null = null;
    const startVal = displayValue;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (value - startVal) * eased;
      setDisplayValue(current);

      if (progress < 1) {
        animId = requestAnimationFrame(animate);
      }
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [value, duration, shouldReduceMotion]);

  const num = Number(displayValue.toFixed(decimals));
  return <>{formatter ? formatter(num) : num.toLocaleString()}</>;
}

