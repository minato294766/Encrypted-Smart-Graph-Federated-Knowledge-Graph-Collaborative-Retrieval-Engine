"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { InertiaPlugin } from "gsap/InertiaPlugin";

gsap.registerPlugin(InertiaPlugin);

interface Dot {
  cx: number;
  cy: number;
  xOffset: number;
  yOffset: number;
  _inertiaApplied: boolean;
}

export interface DotGridProps {
  dotSize?: number;
  gap?: number;
  baseColor?: string;
  activeColor?: string;
  proximity?: number;
  speedTrigger?: number;
  shockRadius?: number;
  shockStrength?: number;
  maxSpeed?: number;
  resistance?: number;
  returnDuration?: number;
  className?: string;
  style?: React.CSSProperties;
}

function hexToRgb(hex: string) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

function throttleFn<T extends unknown[]>(
  func: (...args: T) => void,
  limit: number
) {
  let lastCall = 0;
  return function (this: unknown, ...args: T) {
    const now = performance.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      func.apply(this, args);
    }
  };
}

export function DotGrid({
  dotSize = 4,
  gap = 20,
  baseColor = "#27FF64",
  activeColor = "#27FF64",
  proximity = 150,
  speedTrigger = 100,
  shockRadius = 250,
  shockStrength = 5,
  maxSpeed = 5000,
  resistance = 750,
  returnDuration = 1.5,
  className = "",
  style,
}: DotGridProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef<Dot[]>([]);
  const rafIdRef = useRef<number>(0);
  const pointerRef = useRef({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    speed: 0,
    lastTime: 0,
    lastX: 0,
    lastY: 0,
  });
  const circlePathRef = useRef<Path2D | null>(null);
  const prevDotSizeRef = useRef<number>(-1);

  // Store all props in a ref so the stable effect closure always reads current values
  const propsRef = useRef({
    dotSize,
    gap,
    baseColor,
    activeColor,
    proximity,
    speedTrigger,
    shockRadius,
    shockStrength,
    maxSpeed,
    resistance,
    returnDuration,
  });
  useEffect(() => {
    propsRef.current = {
      dotSize,
      gap,
      baseColor,
      activeColor,
      proximity,
      speedTrigger,
      shockRadius,
      shockStrength,
      maxSpeed,
      resistance,
      returnDuration,
    };
  });

  useEffect(() => {
    const wrap = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const buildGrid = () => {
      const { dotSize: ds, gap: g } = propsRef.current;
      const { width, height } = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);

      const cols = Math.floor((width + g) / (ds + g));
      const rows = Math.floor((height + g) / (ds + g));
      const cell = ds + g;

      const gridW = cell * cols - g;
      const gridH = cell * rows - g;
      const startX = (width - gridW) / 2 + ds / 2;
      const startY = (height - gridH) / 2 + ds / 2;

      const newDots: Dot[] = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          newDots.push({
            cx: startX + x * cell,
            cy: startY + y * cell,
            xOffset: 0,
            yOffset: 0,
            _inertiaApplied: false,
          });
        }
      }
      dotsRef.current = newDots;
    };

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const {
        dotSize: ds,
        proximity: prox,
        baseColor: bc,
        activeColor: ac,
      } = propsRef.current;
      const baseRgb = hexToRgb(bc);
      const activeRgbVal = hexToRgb(ac);
      const proxSq = prox * prox;

      if (prevDotSizeRef.current !== ds) {
        circlePathRef.current = new Path2D();
        circlePathRef.current.arc(0, 0, ds / 2, 0, Math.PI * 2);
        prevDotSizeRef.current = ds;
      }
      const circlePath = circlePathRef.current!;

      const { x: px, y: py } = pointerRef.current;

      for (const dot of dotsRef.current) {
        const ox = dot.cx + dot.xOffset;
        const oy = dot.cy + dot.yOffset;
        const dx = dot.cx - px;
        const dy = dot.cy - py;
        const dsq = dx * dx + dy * dy;

        let fillStyle = bc;
        if (dsq <= proxSq) {
          const dist = Math.sqrt(dsq);
          const t = 1 - dist / prox;
          const r = Math.round(baseRgb.r + (activeRgbVal.r - baseRgb.r) * t);
          const g2 = Math.round(
            baseRgb.g + (activeRgbVal.g - baseRgb.g) * t
          );
          const b2 = Math.round(
            baseRgb.b + (activeRgbVal.b - baseRgb.b) * t
          );
          fillStyle = `rgb(${r},${g2},${b2})`;
        }

        ctx.save();
        ctx.translate(ox, oy);
        ctx.fillStyle = fillStyle;
        ctx.fill(circlePath);
        ctx.restore();
      }

      rafIdRef.current = requestAnimationFrame(draw);
    };

    const onMove = (e: MouseEvent) => {
      const now = performance.now();
      const pr = pointerRef.current;
      const {
        maxSpeed: ms,
        speedTrigger: st,
        proximity: prox,
        resistance: res,
        returnDuration: rd,
      } = propsRef.current;

      const dt = pr.lastTime ? now - pr.lastTime : 16;
      const dx = e.clientX - pr.lastX;
      const dy = e.clientY - pr.lastY;
      let vx = (dx / dt) * 1000;
      let vy = (dy / dt) * 1000;
      let speed = Math.hypot(vx, vy);
      if (speed > ms) {
        const scale = ms / speed;
        vx *= scale;
        vy *= scale;
        speed = ms;
      }
      pr.lastTime = now;
      pr.lastX = e.clientX;
      pr.lastY = e.clientY;
      pr.vx = vx;
      pr.vy = vy;
      pr.speed = speed;

      const rect = canvas.getBoundingClientRect();
      pr.x = e.clientX - rect.left;
      pr.y = e.clientY - rect.top;

      for (const dot of dotsRef.current) {
        const dist = Math.hypot(dot.cx - pr.x, dot.cy - pr.y);
        if (speed > st && dist < prox && !dot._inertiaApplied) {
          dot._inertiaApplied = true;
          gsap.killTweensOf(dot);
          const pushX = dot.cx - pr.x + vx * 0.005;
          const pushY = dot.cy - pr.y + vy * 0.005;
          gsap.to(dot, {
            inertia: { xOffset: pushX, yOffset: pushY, resistance: res },
            onComplete: () => {
              gsap.to(dot, {
                xOffset: 0,
                yOffset: 0,
                duration: rd,
                ease: "elastic.out(1,0.75)",
              });
              dot._inertiaApplied = false;
            },
          });
        }
      }
    };

    const onClick = (e: MouseEvent) => {
      const {
        shockRadius: sr,
        shockStrength: ss,
        resistance: res,
        returnDuration: rd,
      } = propsRef.current;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      for (const dot of dotsRef.current) {
        const dist = Math.hypot(dot.cx - cx, dot.cy - cy);
        if (dist < sr && !dot._inertiaApplied) {
          dot._inertiaApplied = true;
          gsap.killTweensOf(dot);
          const falloff = Math.max(0, 1 - dist / sr);
          const pushX = (dot.cx - cx) * ss * falloff;
          const pushY = (dot.cy - cy) * ss * falloff;
          gsap.to(dot, {
            inertia: { xOffset: pushX, yOffset: pushY, resistance: res },
            onComplete: () => {
              gsap.to(dot, {
                xOffset: 0,
                yOffset: 0,
                duration: rd,
                ease: "elastic.out(1,0.75)",
              });
              dot._inertiaApplied = false;
            },
          });
        }
      }
    };

    const throttledMove = throttleFn(onMove, 50);

    // 延迟至布局完成后再初始化，避免 getBoundingClientRect 返回 0x0
    const init = () => {
      buildGrid();
      draw();
    };
    const initRafId = requestAnimationFrame(() => {
      requestAnimationFrame(init);
    });

    let resizeObserver: ResizeObserver | null = null;
    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(buildGrid);
      resizeObserver.observe(wrap);
    } else {
      (window as Window).addEventListener("resize", buildGrid);
    }

    window.addEventListener("mousemove", throttledMove as EventListener, {
      passive: true,
    });
    window.addEventListener("click", onClick);

    return () => {
      cancelAnimationFrame(initRafId);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", buildGrid);
      }
      window.removeEventListener("mousemove", throttledMove as EventListener);
      window.removeEventListener("click", onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount/unmount only; all props accessed via propsRef

  return (
    <section
      className={`flex items-center justify-center h-full w-full relative${className ? " " + className : ""}`}
      style={style}
    >
      <div ref={wrapperRef} className="w-full h-full relative">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
      </div>
    </section>
  );
}
