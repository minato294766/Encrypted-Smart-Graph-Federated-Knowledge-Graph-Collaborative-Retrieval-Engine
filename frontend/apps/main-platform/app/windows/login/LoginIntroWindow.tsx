"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { BeamsBackground } from "../../beams-background";
import {
  BRAND_BLUE,
  GRID_COLOR,
  VW,
  VH,
  PHASE1_STROKE,
  INTRO_COORDS,
  COLLAPSE_COORDS,
  GRID_V,
  GRID_H,
} from "../shared/coords";
import { LINE_DRAW_EASE, LOGO_DRAW_EASE } from "../shared/animation";
import {
  logoPath,
  getLogoDiamonds,
  updateLines,
  updateClipRect,
  updatePanelFill,
  updatePanelLayout,
  updateLogoPosition,
} from "./utils";
import { LoginForm } from "./LoginForm";

interface LoginIntroWindowProps {
  onSignIn: (isAdmin: boolean, account: string) => void;
}

export function LoginIntroWindow({ onSignIn }: LoginIntroWindowProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const beamsLayerRef = useRef<HTMLDivElement>(null);
  const coordsRef = useRef({ ...INTRO_COORDS });
  const canTriggerRef = useRef(false);
  const playedRef = useRef(false);
  const [inverted, setInverted] = useState(false);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const coords = coordsRef.current;
    const mainLines = svg.querySelectorAll<SVGLineElement>(".main-line");
    const logoLines = svg.querySelectorAll<SVGPathElement>(".logo-stroke");
    const gridLines = svg.querySelectorAll<SVGLineElement>(".ref-grid");
    const clipRect = svg.querySelector<SVGRectElement>("#clip-rect");
    const panelRect = svg.querySelector<SVGRectElement>("#panel-fill");
    const introPanel = svg.querySelector<SVGForeignObjectElement>("#intro-panel");
    const loginPanel = svg.querySelector<SVGForeignObjectElement>("#login-panel");
    const hintLayer = svg.querySelector<SVGGElement>("#hint-layer");
    const logoGroup = svg.querySelector<SVGGElement>("#logo-group");
    const logoFill = svg.querySelector<SVGGElement>("#logo-fill");
    const logoOutline = svg.querySelector<SVGGElement>("#logo-outline");
    const beamsLayer = beamsLayerRef.current;

    mainLines.forEach((line) => {
      const len = line.getTotalLength();
      gsap.set(line, { strokeDasharray: len, strokeDashoffset: len });
    });
    logoLines.forEach((path) => {
      const len = path.getTotalLength();
      gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
    });

    gsap.set(gridLines, { opacity: 0.55 });
    gsap.set(introPanel, { opacity: 0 });
    gsap.set(hintLayer, { opacity: 0 });
    gsap.set(loginPanel, { opacity: 0 });
    if (beamsLayer) gsap.set(beamsLayer, { opacity: 0.17 });
    if (logoFill) gsap.set(logoFill, { fillOpacity: 0 });
    if (panelRect) {
      gsap.set(panelRect, {
        fill: "#ffffff",
        attr: {
          x: (coords.x1 + coords.x2) / 2,
          y: (coords.y1 + coords.y2) / 2,
          width: 0,
          height: 0,
        },
      });
    }

    updateLines(svg, coords);
    updateClipRect(clipRect, coords);
    updatePanelLayout(introPanel, loginPanel, coords);
    updateLogoPosition(logoGroup, coords);

    // === Phase 1: Draw ===
    const introTl = gsap.timeline({
      defaults: { ease: "power2.out" },
      onComplete: () => {
        canTriggerRef.current = true;
      },
    });

    introTl.to(mainLines, {
      strokeDashoffset: 0,
      duration: 1.08,
      ease: LINE_DRAW_EASE,
      stagger: 0.08,
    }, 0);

    introTl.to(logoLines, {
      strokeDashoffset: 0,
      duration: 0.94,
      ease: LOGO_DRAW_EASE,
      stagger: 0.04,
    }, 0.12);

    if (panelRect) {
      introTl.to(panelRect, {
        attr: {
          x: coords.x1,
          y: coords.y1,
          width: coords.x2 - coords.x1,
          height: coords.y2 - coords.y1,
        },
        duration: 0.72,
        ease: "power3.out",
      }, 0.4);
    }

    if (logoFill) {
      introTl.to(logoFill, { fillOpacity: 1, duration: 0.35 }, 0.74);
    }

    introTl.fromTo(introPanel, {
      opacity: 0,
      y: coords.y1 + 20,
    }, {
      opacity: 1,
      y: coords.y1 + 16,
      duration: 0.42,
      ease: "power2.out",
    }, 0.9);

    introTl.to(hintLayer, { opacity: 1, duration: 0.28 }, 1.1);

    // === Phase 2: Inversion + collapse + login switch ===
    const stage2Tl = gsap.timeline({ paused: true, defaults: { ease: "power3.inOut" } });

    stage2Tl.to(coords, {
      ...COLLAPSE_COORDS,
      duration: 1.02,
      onUpdate: () => {
        updateLines(svg, coords);
        updateClipRect(clipRect, coords);
        updatePanelFill(panelRect, coords);
        updatePanelLayout(introPanel, loginPanel, coords);
        updateLogoPosition(logoGroup, coords);
      },
    }, 0);

    if (panelRect) {
      stage2Tl.to(panelRect, { fill: BRAND_BLUE, duration: 0.54 }, 0.05);
    }
    stage2Tl.to(introPanel, { opacity: 0, duration: 0.22 }, 0.12);
    stage2Tl.to(loginPanel, { opacity: 1, duration: 0.34 }, 0.24);
    stage2Tl.to(hintLayer, { opacity: 0, duration: 0.18 }, 0.03);
    if (logoOutline) {
      stage2Tl.to(logoOutline, { stroke: "#ffffff", duration: 0.45 }, 0.08);
    }
    if (logoFill) {
      stage2Tl.to(logoFill.querySelectorAll("path"), { fill: "#ffffff", duration: 0.45 }, 0.08);
    }
    stage2Tl.call(() => setInverted(true), [], 0.06);

    const playStage2 = () => {
      if (!canTriggerRef.current || playedRef.current) return;
      playedRef.current = true;
      stage2Tl.play(0);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) playStage2();
    };
    const onClick = () => playStage2();

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("click", onClick);
    introTl.play(0);

    return () => {
      introTl.kill();
      stage2Tl.kill();
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <main className="login-svg-page">
      <div ref={beamsLayerRef} className="login-beams-layer" aria-hidden="true">
        <BeamsBackground
          beamWidth={2.4}
          beamHeight={17}
          beamNumber={10}
          lightColor="#4a68ff"
          speed={0.85}
          noiseIntensity={1.05}
          scale={0.22}
          rotation={18}
        />
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="xMidYMid slice"
        className="login-svg-canvas"
      >
        <defs>
          <clipPath id="text-clip">
            <rect
              id="clip-rect"
              x={INTRO_COORDS.x1}
              y={INTRO_COORDS.y1}
              width={INTRO_COORDS.x2 - INTRO_COORDS.x1}
              height={INTRO_COORDS.y2 - INTRO_COORDS.y1}
            />
          </clipPath>
        </defs>

        {GRID_V.map((x, i) => (
          <line key={`gv-${i}`} className="ref-grid" x1={x} y1={0} x2={x} y2={VH} stroke={GRID_COLOR} strokeWidth={1} />
        ))}
        {GRID_H.map((y, i) => (
          <line key={`gh-${i}`} className="ref-grid" x1={0} y1={y} x2={VW} y2={y} stroke={GRID_COLOR} strokeWidth={1} />
        ))}

        <rect
          id="panel-fill"
          x={INTRO_COORDS.x1}
          y={INTRO_COORDS.y1}
          width={INTRO_COORDS.x2 - INTRO_COORDS.x1}
          height={INTRO_COORDS.y2 - INTRO_COORDS.y1}
          fill="#ffffff"
        />

        <line className="main-line" id="line-left" x1={INTRO_COORDS.x1} y1={0} x2={INTRO_COORDS.x1} y2={VH} stroke={BRAND_BLUE} strokeWidth={PHASE1_STROKE} />
        <line className="main-line" id="line-right" x1={INTRO_COORDS.x2} y1={0} x2={INTRO_COORDS.x2} y2={VH} stroke={BRAND_BLUE} strokeWidth={PHASE1_STROKE} />
        <line className="main-line" id="line-top" x1={0} y1={INTRO_COORDS.y1} x2={VW} y2={INTRO_COORDS.y1} stroke={BRAND_BLUE} strokeWidth={PHASE1_STROKE} />
        <line className="main-line" id="line-bottom" x1={0} y1={INTRO_COORDS.y2} x2={VW} y2={INTRO_COORDS.y2} stroke={BRAND_BLUE} strokeWidth={PHASE1_STROKE} />

        <g id="logo-group">
          <g id="logo-outline">
            {getLogoDiamonds().map((diamond, idx) => (
              <path
                key={`logo-outline-${idx}`}
                className="logo-stroke"
                d={logoPath(diamond.cx, diamond.cy, diamond.size)}
                fill="none"
                stroke={BRAND_BLUE}
                strokeWidth={1.5}
              />
            ))}
          </g>
          <g id="logo-fill">
            {getLogoDiamonds().map((diamond, idx) => (
              <path
                key={`logo-fill-${idx}`}
                d={logoPath(diamond.cx, diamond.cy, diamond.size)}
                fill={BRAND_BLUE}
              />
            ))}
          </g>
        </g>

        <g clipPath="url(#text-clip)">
          <foreignObject
            id="intro-panel"
            x={INTRO_COORDS.x1 + 16}
            y={INTRO_COORDS.y1 + 25}
            width={INTRO_COORDS.x2 - INTRO_COORDS.x1 - 24}
            height={INTRO_COORDS.y2 - INTRO_COORDS.y1 - 32}
          >
            <div className={`svg-text-content ${inverted ? "is-inverted" : ""}`}>
              <div className="svg-intro">
                <h1 className="svg-headline">
                  <span className="svg-headline-main">&nbsp;&nbsp;密态智图</span>
                  <br />
                  <br />
                  <br />
                  <span className="svg-headline-sub">——联邦知识图谱协同检索系统</span>
                </h1>
              </div>
            </div>
          </foreignObject>
          <foreignObject
            id="login-panel"
            x={INTRO_COORDS.x1 + 16}
            y={INTRO_COORDS.y1 + 16}
            width={INTRO_COORDS.x2 - INTRO_COORDS.x1 - 32}
            height={INTRO_COORDS.y2 - INTRO_COORDS.y1 - 32}
          >
            <div className="svg-text-content is-inverted">
              <LoginForm onSignIn={onSignIn} />
            </div>
          </foreignObject>
        </g>

        <g id="hint-layer">
          <text
            x={INTRO_COORDS.x2 - 22}
            y={INTRO_COORDS.y2 - 14}
            textAnchor="end"
            className="svg-scroll-hint"
          >
            ˅˅
          </text>
        </g>
      </svg>
    </main>
  );
}
