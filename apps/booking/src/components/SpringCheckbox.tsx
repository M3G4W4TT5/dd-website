"use client";

import { useEffect, useLayoutEffect, useRef, type InputHTMLAttributes } from "react";
import { animate, useMotionValue, useMotionValueEvent, useReducedMotion } from "motion/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";

import "./SpringCheckbox.css";

const TICK_PATH = String(Tick02Icon[0][1].d);
const SWELL = 0.35;

function springBounce(bounce: number) {
  const damping = -Math.log(bounce) / Math.sqrt(Math.PI ** 2 + Math.log(bounce) ** 2);
  return 1 - damping;
}

type SpringCheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked"> & {
  checked: boolean;
};

// Keep the native input so labels, form validation, keyboard input and focus still work.
export function SpringCheckbox({ checked, className = "", ...inputProps }: SpringCheckboxProps) {
  const reduceMotion = useReducedMotion();
  const progress = useMotionValue(checked ? 1 : 0);
  const boxRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const tickRef = useRef<SVGPathElement>(null);

  const write = (value: number) => {
    const held = Math.min(1, Math.max(0, value));
    if (boxRef.current) boxRef.current.style.transform = `scale(${1 + SWELL * Math.max(0, value - 1)})`;
    if (fillRef.current) fillRef.current.style.transform = `scale(${Math.max(0, value)})`;
    if (tickRef.current) tickRef.current.style.strokeDashoffset = String(1 - held);
  };
  useMotionValueEvent(progress, "change", write);
  useLayoutEffect(() => write(progress.get()));

  useEffect(() => {
    const target = checked ? 1 : 0;
    if (reduceMotion) {
      progress.jump(target);
      return;
    }
    if (progress.get() === target && progress.getVelocity() === 0) return;
    const controls = animate(progress, target, {
      type: "spring",
      visualDuration: 0.2,
      bounce: springBounce(0.3),
    });
    return () => controls.stop();
  }, [checked, progress, reduceMotion]);

  const initial = progress.get();
  const held = Math.min(1, Math.max(0, initial));
  return (
    <span className={`spring-checkbox${className ? ` ${className}` : ""}`}>
      <input {...inputProps} type="checkbox" checked={checked} />
      <span ref={boxRef} className="spring-checkbox__box" style={{ transform: `scale(${1 + SWELL * Math.max(0, initial - 1)})` }} aria-hidden="true">
        <span className="spring-checkbox__ring" />
        <span ref={fillRef} className="spring-checkbox__fill" style={{ transform: `scale(${initial})` }} />
        <svg className="spring-checkbox__tick" viewBox="0 0 24 24">
          <path ref={tickRef} d={TICK_PATH} pathLength={1} strokeDasharray={1} style={{ strokeDashoffset: 1 - held }} />
        </svg>
      </span>
    </span>
  );
}
