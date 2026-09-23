import { motion, useReducedMotion } from "motion/react";

export function MotionMark() {
  const reduced = useReducedMotion();
  return (
    <div className="motion-mark" aria-hidden="true">
      <motion.div
        className="motion-ring ring-outer"
        animate={reduced ? undefined : { rotate: 360 }}
        transition={reduced ? undefined : { duration: 45, repeat: Infinity, ease: "linear" }}
      ><span /></motion.div>
      <motion.div
        className="motion-ring ring-inner"
        animate={reduced ? undefined : { rotate: -360 }}
        transition={reduced ? undefined : { duration: 60, repeat: Infinity, ease: "linear" }}
      ><span /></motion.div>
      <motion.span className="motion-initials" initial={reduced ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .9, ease: "easeOut" }}>DD</motion.span>
      <span className="motion-caption">BODY IN MOTION</span>
    </div>
  );
}
