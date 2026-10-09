import { useEffect, useRef, useState } from "react";

const EXIT_MS = 200;
const ENTER_MS = 240;

function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Animates changes like an odometer (old value drops out, new one drops in); the first render is static. */
export function RollingNumber({ value }: { value: number }) {
  const [previous, setPrevious] = useState(value);
  const [outgoing, setOutgoing] = useState<number | null>(null);
  const [rollKey, setRollKey] = useState(0);
  // Adjusting state during render is the supported way to react to a prop change without an extra pass.
  if (value !== previous) {
    setPrevious(value);
    setOutgoing(previous);
    setRollKey((k) => k + 1);
  }

  const incomingRef = useRef<HTMLSpanElement | null>(null);
  const outgoingRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (rollKey === 0 || reducedMotion()) {
      setOutgoing(null);
      return;
    }
    const incoming = incomingRef.current;
    const leaving = outgoingRef.current;
    if (typeof incoming?.animate !== "function") {
      setOutgoing(null);
      return;
    }
    incoming.animate([{ transform: "translateY(-100%)" }, { transform: "translateY(0)" }], {
      duration: ENTER_MS,
      delay: EXIT_MS,
      easing: "cubic-bezier(0.2, 0.8, 0.3, 1)",
      fill: "backwards",
    });
    const exit = leaving?.animate([{ transform: "translateY(0)" }, { transform: "translateY(100%)" }], {
      duration: EXIT_MS,
      easing: "cubic-bezier(0.5, 0, 0.9, 0.4)",
      fill: "forwards",
    });
    if (exit) exit.onfinish = () => setOutgoing(null);
    else setOutgoing(null);
  }, [rollKey]);

  return (
    <span className="relative inline-flex overflow-hidden align-bottom">
      <span ref={incomingRef}>{value}</span>
      {outgoing !== null ? (
        <span ref={outgoingRef} aria-hidden className="absolute top-0 left-0">
          {outgoing}
        </span>
      ) : null}
    </span>
  );
}
