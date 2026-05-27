"use client";

import { useMemo, type CSSProperties } from "react";

const ROTATION_DEG = -28;
const FONT_SIZE = 12;
const LETTER_SPACING = 0.45;
const STEP_PADDING_X = 10;
const STEP_PADDING_Y = 70;
const FONT_FAMILY = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
const FONT_WEIGHT = 260;
const WATERMARK_LIGHT_COLOR = "rgba(0,0,0,0.04)";
const WATERMARK_DARK_COLOR = "rgba(0,0,0,0.1)";

const NOISE_PATTERN_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>
    <rect width='96' height='96' fill='rgba(0,0,0,0)'/>
    <circle cx='6' cy='14' r='1' fill='rgba(20,20,20,0.09)'/>
    <circle cx='24' cy='30' r='1' fill='rgba(20,20,20,0.08)'/>
    <circle cx='42' cy='12' r='0.9' fill='rgba(20,20,20,0.08)'/>
    <circle cx='60' cy='26' r='1' fill='rgba(20,20,20,0.08)'/>
    <circle cx='78' cy='16' r='0.9' fill='rgba(20,20,20,0.09)'/>
    <circle cx='14' cy='50' r='0.9' fill='rgba(20,20,20,0.08)'/>
    <circle cx='30' cy='62' r='1' fill='rgba(20,20,20,0.08)'/>
    <circle cx='52' cy='54' r='0.9' fill='rgba(20,20,20,0.08)'/>
    <circle cx='70' cy='66' r='1' fill='rgba(20,20,20,0.08)'/>
    <circle cx='88' cy='56' r='0.9' fill='rgba(20,20,20,0.09)'/>
    <circle cx='8' cy='84' r='1' fill='rgba(20,20,20,0.08)'/>
    <circle cx='26' cy='80' r='0.9' fill='rgba(20,20,20,0.08)'/>
    <circle cx='44' cy='90' r='1' fill='rgba(20,20,20,0.08)'/>
    <circle cx='64' cy='82' r='0.9' fill='rgba(20,20,20,0.09)'/>
    <circle cx='84' cy='88' r='1' fill='rgba(20,20,20,0.08)'/>
  </svg>`,
)}`;

interface WatermarkOverlayProps {
  text: string;
}

type WatermarkPattern = {
  dataUri: string;
  stepX: number;
  stepY: number;
};

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function estimateTextWidth(rawText: string): number {
  const chars = Array.from(rawText);
  if (chars.length === 0) return FONT_SIZE * 3;

  const glyphUnits = chars.reduce((sum, ch) => {
    if (/^[\u3400-\u9FFF\uF900-\uFAFF]$/.test(ch)) return sum + 1;
    if (/^[\x20-\x7E]$/.test(ch)) return sum + 0.58;
    return sum + 0.9;
  }, 0);

  return glyphUnits * FONT_SIZE + Math.max(chars.length - 1, 0) * LETTER_SPACING;
}

function buildWatermarkPattern(text: string): WatermarkPattern {
  const rawText = text.trim() || "图书馆-法律文献区";
  const safeText = escapeXml(rawText);

  const textWidth = estimateTextWidth(rawText);
  const textHeight = FONT_SIZE * 1.3;
  const rotationRad = Math.abs(ROTATION_DEG) * (Math.PI / 180);
  const rotatedWidth = textWidth * Math.cos(rotationRad) + textHeight * Math.sin(rotationRad);
  const rotatedHeight = textWidth * Math.sin(rotationRad) + textHeight * Math.cos(rotationRad);

  const stepX = Math.max(84, Math.ceil(rotatedWidth + STEP_PADDING_X));
  const stepY = Math.max(56, Math.ceil(rotatedHeight + STEP_PADDING_Y));
  const centerX = stepX / 2;
  const centerY = stepY / 2;

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${stepX}' height='${stepY}' viewBox='0 0 ${stepX} ${stepY}'>
    <rect width='${stepX}' height='${stepY}' fill='rgba(0,0,0,0)'/>
    <g font-size='${FONT_SIZE}' font-weight='${FONT_WEIGHT}' letter-spacing='${LETTER_SPACING}' font-family='${FONT_FAMILY}'>
      <text x='${centerX + 0.8}' y='${centerY + 0.8}' text-anchor='middle' dominant-baseline='middle' transform='rotate(${ROTATION_DEG} ${centerX + 0.8} ${centerY + 0.8})' fill='${WATERMARK_LIGHT_COLOR}'>${safeText}</text>
      <text x='${centerX}' y='${centerY}' text-anchor='middle' dominant-baseline='middle' transform='rotate(${ROTATION_DEG} ${centerX} ${centerY})' fill='${WATERMARK_DARK_COLOR}'>${safeText}</text>
    </g>
  </svg>`;

  return {
    dataUri: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    stepX,
    stepY,
  };
}

export function WatermarkOverlay({ text }: WatermarkOverlayProps) {
  const pattern = useMemo(() => buildWatermarkPattern(text), [text]);

  const style = useMemo(
    () =>
      ({
        "--wm-text-pattern": `url("${pattern.dataUri}")`,
        "--wm-step-x": `${pattern.stepX}px`,
        "--wm-step-y": `${pattern.stepY}px`,
        "--wm-text-size": `${pattern.stepX}px ${pattern.stepY}px`,
        "--wm-offset-x": `${pattern.stepX / 2}px`,
        "--wm-offset-y": `${pattern.stepY / 2}px`,
        "--wm-noise-pattern": `url("${NOISE_PATTERN_DATA_URI}")`,
      }) as CSSProperties,
    [pattern],
  );

  return <div className="global-watermark-overlay" style={style} aria-hidden="true" />;
}
