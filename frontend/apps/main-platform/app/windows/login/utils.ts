import { INTRO_COORDS } from "../shared/coords";

type Coords = { x1: number; x2: number; y1: number; y2: number };

export function logoPath(cx: number, cy: number, size: number): string {
  const h = size / 2;
  return `M${cx},${cy - h} L${cx + h},${cy} L${cx},${cy + h} L${cx - h},${cy} Z`;
}

export function getLogoDiamonds() {
  return [
    { cx: 10, cy: 6, size: 10 },
    { cx: 22, cy: 6, size: 10 },
    { cx: 4, cy: 16, size: 10 },
    { cx: 16, cy: 16, size: 10 },
    { cx: 28, cy: 16, size: 10 },
  ];
}

export function updateLines(svg: SVGSVGElement, c: Coords) {
  const set = (id: string, attrs: Record<string, number>) => {
    const el = svg.querySelector(`#${id}`);
    if (el) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  };
  set("line-left", { x1: c.x1, x2: c.x1 });
  set("line-right", { x1: c.x2, x2: c.x2 });
  set("line-top", { y1: c.y1, y2: c.y1 });
  set("line-bottom", { y1: c.y2, y2: c.y2 });
}

export function updateClipRect(rect: SVGRectElement | null, c: Coords) {
  if (!rect) return;
  rect.setAttribute("x", String(c.x1));
  rect.setAttribute("y", String(c.y1));
  rect.setAttribute("width", String(c.x2 - c.x1));
  rect.setAttribute("height", String(c.y2 - c.y1));
}

export function updatePanelFill(rect: SVGRectElement | null, c: Coords) {
  if (!rect) return;
  rect.setAttribute("x", String(c.x1));
  rect.setAttribute("y", String(c.y1));
  rect.setAttribute("width", String(c.x2 - c.x1));
  rect.setAttribute("height", String(c.y2 - c.y1));
}

export function updatePanelLayout(
  introPanel: SVGForeignObjectElement | null,
  loginPanel: SVGForeignObjectElement | null,
  c: Coords,
) {
  const pad = 16;
  const introRightPad = 8;
  const introTopPad = 25;
  const x = c.x1 + pad;
  const introY = c.y1 + introTopPad;
  const loginY = c.y1 + pad;
  const introWidth = Math.max(10, c.x2 - c.x1 - pad - introRightPad);
  const loginWidth = Math.max(10, c.x2 - c.x1 - pad * 2);
  const height = Math.max(10, c.y2 - c.y1 - pad * 2);

  if (introPanel) {
    introPanel.setAttribute("x", String(x));
    introPanel.setAttribute("y", String(introY));
    introPanel.setAttribute("width", String(introWidth));
    introPanel.setAttribute("height", String(height));
  }

  if (loginPanel) {
    loginPanel.setAttribute("x", String(x));
    loginPanel.setAttribute("y", String(loginY));
    loginPanel.setAttribute("width", String(loginWidth));
    loginPanel.setAttribute("height", String(height));
  }
}

export function updateLogoPosition(group: SVGGElement | null, c: Coords) {
  if (!group) return;
  const baseWidth = INTRO_COORDS.x2 - INTRO_COORDS.x1;
  const scale = Math.max(0.58, Math.min(1, (c.x2 - c.x1) / baseWidth));
  group.setAttribute("transform", `translate(${c.x1 + 24}, ${c.y2 - 44}) scale(${scale})`);
}
