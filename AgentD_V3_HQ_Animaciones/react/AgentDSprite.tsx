import React, { useEffect, useState } from "react";

export type AgentDState =
  | "idle" | "run" | "search" | "thinking" | "talk" | "success"
  | "jump" | "discount" | "accept" | "reject" | "counteroffer"
  | "offer_received" | "surprised" | "payment_approved";

const animations: Record<AgentDState, { count: number; ms: number }> = {
  idle:{count:8,ms:90}, run:{count:8,ms:70},search:{count:8,ms:80},
  thinking:{count:8,ms:100},talk:{count:8,ms:80},success:{count:8,ms:80},
  jump:{count:8,ms:80},discount:{count:8,ms:80},accept:{count:8,ms:80},
  reject:{count:8,ms:75},counteroffer:{count:8,ms:75},
  offer_received:{count:8,ms:80},surprised:{count:8,ms:70},
  payment_approved:{count:8,ms:80}
};

export type AgentDSpriteProps = {
  state: AgentDState;
  size?: number; // tamaño visible: no depende del tamaño del PNG
  speed?: number; // 1 = velocidad original; 1.25 = 25% más rápido
  assetBase?: string; // coloca frames/ en public/agentd-v3/frames/
  loop?: boolean;
  className?: string;
  alt?: string;
  onComplete?: () => void;
};

export function AgentDSprite({
  state, size = 160, speed = 1, assetBase = "/agentd-v3",
  loop = true, className, alt = "Agent D", onComplete
}: AgentDSpriteProps) {
  const [frame, setFrame] = useState(0);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handle = () => setReduced(q.matches);
    handle();q.addEventListener?.("change", handle);
    return () => q.removeEventListener?.("change", handle);
  }, []);
  useEffect(() => {
    setFrame(0);
    if (reduced) return;
    const {count,ms} = animations[state];
    let index = 0;
    const interval = window.setInterval(() => {
      if (index >= count - 1) {
        if (!loop) {
          window.clearInterval(interval);
          onComplete?.(); // solo una vez al finalizar el ciclo
          return;
        }
        index = 0;
      } else {
        index += 1;
      }
      setFrame(index);
    }, Math.max(35, ms / Math.max(speed, 0.1)));
    return () => window.clearInterval(interval);
  }, [state,speed,loop,reduced,onComplete]);
  const file = String(reduced ? 0 : frame).padStart(2,"0");
  return <img
    className={className}
    width={size} height={size}
    alt={alt}
    draggable={false}
    style={{width:size,height:size,objectFit:"contain",display:"block",userSelect:"none"}}
    src={`${assetBase}/frames/${state}/${file}.png`}
  />;
}

export default AgentDSprite;
