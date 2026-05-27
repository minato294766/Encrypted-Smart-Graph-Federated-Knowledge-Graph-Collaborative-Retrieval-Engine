"use client";

import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  EdgesGeometry,
  ExtrudeGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  LineBasicMaterial,
  MathUtils,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  Texture,
  Vector2,
  type Group,
} from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { useAppRuntime } from "@/app/components/runtime/AppRuntimeProvider";
import { buildNodeAuthContext, createNodeAuthHeaders } from "@/app/lib/client/node-auth-headers";

gsap.registerPlugin(useGSAP);

interface D3SandboxProps {
  visible: boolean;
  onSectorChange: (sectorId: string) => void;
  onNodeSelect: (nodeId: string | null) => void;
  selfNodeName?: string;
  isSelfCenterNode?: boolean;
  selfNodePlacement?: {
    plateId: PlateId;
    sceneX: number;
    sceneY: number;
  } | null;
  selectionRevision?: number;
}

function isSelfNodeId(nodeId: string): boolean {
  return nodeId === "node-center-red";
}

interface NodeConfig {
  id: string;
  name: string;
  isRed: boolean;
  isCenter?: boolean;
  offsetX: number;
  offsetY?: number;
  sceneX?: number;
  sceneY?: number;
}

interface MockNodeData {
  v1: string; l1: string;
  v2: string; l2: string;
  v3: string; l3: string;
  code: string;
  lastSeen: string;
}

interface Metrics {
  totalFiles: number;
  clusterCount: number;
  lastAddedDate: string | null;
}

const SVG_WIDTH = 1280;
const SVG_HEIGHT = 1080;
const SVG_CENTER_X = SVG_WIDTH / 2;
const SVG_CENTER_Y = SVG_HEIGHT / 2;
const BASE_DEPTH = 24;
const SELECTED_DEPTH_SCALE = 2.5;
const SPREAD_DISTANCE = 12;
const SCENE_SCALE_XY = 0.78;
const SIDE_LINE_Z_EPSILON = 0.28;
const DESKTOP_SVG_URL = "/Desktop.svg";
const PLATE_IDS = ["plate-1", "plate-2", "plate-3", "plate-4", "plate-5"] as const;
type PlateId = (typeof PLATE_IDS)[number];

const DESKTOP_MASK_PATHS_FALLBACK = [
  "M200.5 702.5V625H462.5L472.5 678.5L473 683V842.5H464L436 850L355 870.5L350.5 871.5L347 872H253L250 871L244.5 868.5L241 866L238.5 863.5L235.5 860L232.5 855L229.5 847.5L223.5 816.5L212 762L200.5 702.5Z",
  "M596.5 238H483V305.5H461.5V487L645.5 489V596H749.5L759 593L770.5 587.5L780 582L789.5 574.5L799 567L808.5 561L817.5 556L827.5 552L837 548.5L851 546L863 545H886V643.5L944.5 689.5L1007 611.5L1011.5 604L1015.5 595.5L1018 587L1019.5 580V550H1041.5L1051 549.5L1062.5 547.5L1074.5 543L1087 537L1095.5 531L1105 523L1143 478.5V452.5H1090V326H1004L974.5 310H912L907 311L903 313L900 315L897 317.5L894.5 320.5L892.5 323.5L891 326L889.5 329.5L888.5 333V380.5H618V260L617 256.5L614.5 251L610.5 245.5L606.5 242.5L602 239.5L596.5 238Z",
  "M445 23L450 23.5L455 25L458.5 27L464 31L469.5 36L475 42.5L478 47L480 51.5L481 54L481.5 56V185L481 185.5L479.5 186.5L478 187.5L476.5 189L475 190.5L474 192L473.5 193.5V291.5H443.5V517.5L444 523L444.5 527.5L460.5 617L263 617.5V613.5L266.5 158.5L267 156.5L269 153L271.5 150L276.5 145.5L428 27L432 25L437.5 23.5L441.5 23H445Z",
  "M461 516V498.5H633.5V602H758.5L764.5 601L770 599L778.5 594L795.5 582.5L808.5 573.5L816.5 569L824 565.5L832 562.5L839 560L848.5 557.5L859 556.5H877L877.5 645L941.5 693.5L929 709.5L924 718L920.5 726L911 748L901 772.5L892.5 794.5L882.5 825.5H516L514.5 820L461 516Z",
  "M557.5 1002L528 839H878.5L853 942L842.5 987L839.5 997.5L837 1007.5L833 1016.5L828.5 1024L822.5 1031L814.5 1037.5L809 1040.5H598L592.5 1040L583 1036.5L577.5 1033L572.5 1028.5L567.5 1023.5L563.5 1017L560 1009L557.5 1002Z",
] as const;

const DEFAULT_ACTIVE_PLATE_ID = "plate-4";
const AUTO_SELECT_NODE_DELAY_MS = 820;
const INFO_CANVAS_HEIGHT = 88;
const NODE_SPACING_SCALE = 2.2;

const DEFAULT_SELF_NODE_NAME = "图书馆-法律文献区";

const PLATE_TO_SECTOR: Record<PlateId, string> = {
  "plate-1": "node-2",
  "plate-2": "node-4",
  "plate-3": "node-3",
  "plate-4": "node-current",
  "plate-5": "node-5",
};

function mapPlateToSector(plateId: string | null): string {
  if (!plateId) return "node-current";
  if (plateId in PLATE_TO_SECTOR) {
    return PLATE_TO_SECTOR[plateId as PlateId];
  }
  return "node-current";
}

const BASE_PLATE_NODES: Record<PlateId, NodeConfig[]> = {
  "plate-1": [
    { id: "n-simstreet", name: "大数据教研室", isRed: false, offsetX: 0 },
  ],
  "plate-2": [
    { id: "n-registrar", name: "党史教育中心",   isRed: false, offsetX: 0 },
  ],
  "plate-3": [
    { id: "n-gym",       name: "马克思理论教研室",   isRed: false, offsetX: 0 },
  ],
  "plate-4": [
    { id: "n-laoshan",       name: "法学教研室", isRed: false, offsetX: -24 },
  ],
  "plate-5": [
    { id: "n-library",  name: "图书馆-红色经典区", isRed: false, isCenter: true, offsetX: -18 },
    { id: "n-newteach", name: "语言实践中心", isRed: false, offsetX: 18 },
  ],
};

function buildPlateNodes(
  selfNodeName: string,
  isSelfCenterNode: boolean,
  selfNodePlacement: D3SandboxProps["selfNodePlacement"],
): Record<PlateId, NodeConfig[]> {
  const cleanedName = selfNodeName.trim() || DEFAULT_SELF_NODE_NAME;
  const targetPlateId = selfNodePlacement?.plateId ?? "plate-4";

  const base = PLATE_IDS.reduce((acc, plateId) => {
    acc[plateId] = [...BASE_PLATE_NODES[plateId]];
    return acc;
  }, {} as Record<PlateId, NodeConfig[]>);

  const selfNode: NodeConfig = selfNodePlacement
    ? {
        id: "node-center-red",
        name: cleanedName,
        isRed: isSelfCenterNode,
        isCenter: isSelfCenterNode,
        offsetX: 0,
        sceneX: selfNodePlacement.sceneX,
        sceneY: selfNodePlacement.sceneY,
      }
    : {
        id: "node-center-red",
        name: cleanedName,
        isRed: isSelfCenterNode,
        isCenter: isSelfCenterNode,
        offsetX: 24,
      };

  base[targetPlateId] = [...base[targetPlateId], selfNode];
  return base;
}

const NODE_MOCK: Record<string, MockNodeData> = {
  "n-simstreet": { v1: "67",     l1: "活跃度%", v2: "8",     l2: "连接数", v3: "847",   l3: "记录总数", code: "BLK-02", lastSeen: "07:22" },
  "n-registrar": { v1: "59",     l1: "活跃度%", v2: "6",     l2: "连接数", v3: "992",   l3: "记录总数", code: "ADM-02", lastSeen: "09:40" },
  "n-gym":       { v1: "44",     l1: "活跃度%", v2: "5",     l2: "连接数", v3: "438",   l3: "记录总数", code: "PHY-01", lastSeen: "13:58" },
  "n-laoshan":   { v1: "78",     l1: "活跃度%", v2: "9",     l2: "连接数", v3: "1,562", l3: "记录总数", code: "LSY-01", lastSeen: "04:33" },
  "n-library":   { v1: "55",     l1: "活跃度%", v2: "7",     l2: "连接数", v3: "1,093", l3: "记录总数", code: "LIB-01", lastSeen: "10:27" },
  "n-newteach":  { v1: "63",     l1: "活跃度%", v2: "10",    l2: "连接数", v3: "1,781", l3: "记录总数", code: "EDU-02", lastSeen: "06:15" },
};

interface PlateGeometryBundle {
  id: PlateId;
  geometry: ExtrudeGeometry;
  topOverlayGeometry: ShapeGeometry;
  sideLinesGeometry: BufferGeometry;
  edgeGeometry: EdgesGeometry;
  centroid: { x: number; y: number };
}

interface PlateVisualRef {
  group: Group;
  topScanMaterial: MeshBasicMaterial;
  topScanTexture: Texture;
  sideMaterial: MeshStandardMaterial;
  sideLineMaterial: LineBasicMaterial;
  edgeMaterial: LineBasicMaterial;
  pulse: { value: number };
}

function makeSideLineGeometry(shape: Shape, spreadX: number, spreadY: number): BufferGeometry {
  const points = shape.getSpacedPoints(58);
  const positions: number[] = [];

  points.forEach((point) => {
    const tx = point.x - SVG_CENTER_X + spreadX;
    const ty = SVG_CENTER_Y - point.y + spreadY;
    positions.push(tx, ty, SIDE_LINE_Z_EPSILON, tx, ty, BASE_DEPTH - SIDE_LINE_Z_EPSILON);
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

function applySvgTextureUv(geometry: ExtrudeGeometry, spreadX: number, spreadY: number) {
  const position = geometry.getAttribute("position");
  const uvArray = new Float32Array(position.count * 2);

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const sourceX = x - spreadX + SVG_CENTER_X;
    const sourceY = SVG_CENTER_Y - (y - spreadY);

    const u = MathUtils.clamp(sourceX / SVG_WIDTH, 0, 1);
    const v = 1 - MathUtils.clamp(sourceY / SVG_HEIGHT, 0, 1);
    uvArray[i * 2] = u;
    uvArray[i * 2 + 1] = v;
  }

  geometry.setAttribute("uv", new BufferAttribute(uvArray, 2));
}

function createTopScanTexture(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const primary = ctx.createLinearGradient(0, 0, canvas.width, 0);
    primary.addColorStop(0, "rgba(255,255,255,0)");
    primary.addColorStop(0.42, "rgba(255,255,255,0)");
    primary.addColorStop(0.5, "rgba(255,255,255,0.92)");
    primary.addColorStop(0.58, "rgba(255,255,255,0)");
    primary.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const accent = ctx.createLinearGradient(0, 0, canvas.width, 0);
    accent.addColorStop(0.24, "rgba(255,255,255,0)");
    accent.addColorStop(0.285, "rgba(255,255,255,0.42)");
    accent.addColorStop(0.33, "rgba(255,255,255,0)");
    accent.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalAlpha = 0.46;
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.repeat.set(2.05, 1);
  texture.offset.set(0, 0);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function extractDesktopMaskPaths(svgMarkup: string): string[] {
  const xml = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const maskPaths = Array.from(xml.querySelectorAll("mask path[d]"))
    .map((node) => node.getAttribute("d")?.trim())
    .filter((value): value is string => Boolean(value));

  if (maskPaths.length >= 5) {
    return maskPaths.slice(0, 5);
  }

  return [...DESKTOP_MASK_PATHS_FALLBACK];
}

function isWebGlLikeContext(
  context: RenderingContext | null,
): context is WebGLRenderingContext | WebGL2RenderingContext {
  return Boolean(context && "getParameter" in context && "MAX_TEXTURE_SIZE" in context);
}

function computeRawCentroid(shape: Shape): { x: number; y: number } {
  const points = shape.getSpacedPoints(120);
  const sum = points.reduce(
    (acc, point) => {
      acc.x += point.x;
      acc.y += point.y;
      return acc;
    },
    { x: 0, y: 0 },
  );

  return {
    x: sum.x / Math.max(1, points.length),
    y: sum.y / Math.max(1, points.length),
  };
}

function mapShapesToPlateIds(shapes: Shape[]): Array<{ id: PlateId; shape: Shape }> {
  const entries = shapes.map((shape, index) => {
    const center = computeRawCentroid(shape);
    return { index, shape, cx: center.x, cy: center.y };
  });

  if (entries.length < 5) return [];

  const idByIndex = new Map<number, PlateId>();
  const remaining = entries.map((entry) => entry.index);
  const removeIndex = (indexToRemove: number) => {
    const idx = remaining.indexOf(indexToRemove);
    if (idx >= 0) remaining.splice(idx, 1);
  };

  const top = entries.reduce((best, item) => (item.cy < best.cy ? item : best));
  idByIndex.set(top.index, "plate-1");
  removeIndex(top.index);

  const bottom = entries.reduce((best, item) => (item.cy > best.cy ? item : best));
  idByIndex.set(bottom.index, "plate-2");
  removeIndex(bottom.index);

  const remainingEntries = entries.filter((entry) => remaining.includes(entry.index));
  const left = remainingEntries.reduce((best, item) => (item.cx < best.cx ? item : best));
  idByIndex.set(left.index, "plate-3");
  removeIndex(left.index);

  const tail = entries
    .filter((entry) => remaining.includes(entry.index))
    .sort((a, b) => a.cy - b.cy);
  if (tail[0]) idByIndex.set(tail[0].index, "plate-4");
  if (tail[1]) idByIndex.set(tail[1].index, "plate-5");

  return entries
    .map((entry) => {
      const id = idByIndex.get(entry.index);
      if (!id) return null;
      return { id, shape: entry.shape };
    })
    .filter((item): item is { id: PlateId; shape: Shape } => item !== null)
    .sort((a, b) => PLATE_IDS.indexOf(a.id) - PLATE_IDS.indexOf(b.id));
}

function buildPlateGeometries(pathDefs: string[]): PlateGeometryBundle[] {
  const loader = new SVGLoader();
  const svgMarkup = `<svg viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">${pathDefs
    .slice(0, 5)
    .map((path) => `<path d="${path}" />`)
    .join("")}</svg>`;

  const parsed = loader.parse(svgMarkup);
  const shapes = parsed.paths.flatMap((svgPath) => SVGLoader.createShapes(svgPath));
  const mapped = mapShapesToPlateIds(shapes);

  return mapped.map(({ id, shape }) => {
    const sample = shape.getSpacedPoints(100);
    const center = sample.reduce(
      (acc, point) => {
        acc.x += point.x - SVG_CENTER_X;
        acc.y += SVG_CENTER_Y - point.y;
        return acc;
      },
      { x: 0, y: 0 },
    );
    const cx = center.x / Math.max(1, sample.length);
    const cy = center.y / Math.max(1, sample.length);
    const direction = new Vector2(cx, cy);
    const spread = direction.lengthSq() > 0.0001 ? direction.normalize().multiplyScalar(SPREAD_DISTANCE) : new Vector2();

    const geometry = new ExtrudeGeometry(shape, {
      depth: BASE_DEPTH,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 24,
    });
    geometry.translate(-SVG_CENTER_X, -SVG_CENTER_Y, 0);
    geometry.scale(1, -1, 1);
    geometry.translate(spread.x, spread.y, 0);
    applySvgTextureUv(geometry, spread.x, spread.y);
    geometry.computeVertexNormals();

    const topOverlayGeometry = new ShapeGeometry(shape, 24);
    topOverlayGeometry.translate(-SVG_CENTER_X, -SVG_CENTER_Y, 0);
    topOverlayGeometry.scale(1, -1, 1);
    topOverlayGeometry.translate(spread.x, spread.y, BASE_DEPTH + 0.26);

    const sideLinesGeometry = makeSideLineGeometry(shape, spread.x, spread.y);
    const edgeGeometry = new EdgesGeometry(geometry, 35);

    return {
      id,
      geometry,
      topOverlayGeometry,
      sideLinesGeometry,
      edgeGeometry,
      centroid: { x: cx + spread.x, y: cy + spread.y },
    };
  });
}

const CURSOR_LEFT_PATH =
  "M254.5 609C327.821 697.686 389.473 770.607 397 785C405.498 771.741 458.375 707.807 541 607.5C582.567 549.104 599.532 516.654 614 459.5C620.615 409.584 618.912 383.151 605.5 339C582.976 283.441 564.02 258.184 518.5 224C472.988 197.268 446.632 189.034 398 187.5C345.114 189.605 318.741 197.86 277 224C229.549 258.406 211.828 284.033 189.5 340C176.178 379.831 174.499 406.119 181 459.5C191.438 511.408 212.2 545.796 254.5 609Z";
const CURSOR_RIGHT_PATH =
  "M744.181 608.5C817.502 697.186 879.155 770.107 886.681 784.5C895.179 771.241 948.057 707.307 1030.68 607C1072.25 548.604 1089.21 516.154 1103.68 459C1110.3 409.084 1108.59 382.651 1095.18 338.5C1072.66 282.941 1053.7 257.684 1008.18 223.5C962.669 196.768 936.313 188.534 887.681 187C834.795 189.105 808.422 197.36 766.681 223.5C719.23 257.906 701.509 283.533 679.181 339.5C665.859 379.331 664.18 405.619 670.681 459C681.12 510.908 701.882 545.296 744.181 608.5Z";

type CursorTone = "red" | "orange" | "yellow" | "blue";

function resolveCursorTone(node: NodeConfig): CursorTone {
  if (isSelfNodeId(node.id)) {
    return node.isRed ? "red" : "yellow";
  }
  if (node.isCenter) return "orange";
  return "blue";
}

function getCursorTokens(tone: CursorTone) {
  if (tone === "red") {
    return {
      vb: "155 165 490 643",
      path: CURSOR_LEFT_PATH,
      cx: 397,
      fill: "#dc2626",
      grad: "#f87171",
      gradId: "cgr",
    };
  }

  if (tone === "yellow") {
    return {
      vb: "155 165 490 643",
      path: CURSOR_LEFT_PATH,
      cx: 397,
      fill: "#2FD68A",
      grad: "#79E7B7",
      gradId: "cgy",
    };
  }

  if (tone === "orange") {
    return {
      vb: "155 165 490 643",
      path: CURSOR_LEFT_PATH,
      cx: 397,
      fill: "#ea580c",
      grad: "#fb923c",
      gradId: "cgo",
    };
  }

  return {
    vb: "643 165 490 643",
    path: CURSOR_RIGHT_PATH,
    cx: 887,
    fill: "#3b82f6",
    grad: "#93c5fd",
    gradId: "cgb",
  };
}

function CursorPinSvg({ tone }: { tone: CursorTone }) {
  const { vb, path, cx, fill, grad, gradId } = getCursorTokens(tone);
  return (
    <svg viewBox={vb} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradId} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor={grad} />
          <stop offset="100%" stopColor={fill} />
        </linearGradient>
      </defs>
      <path d={path} fill={`url(#${gradId})`} stroke="white" strokeWidth="9" strokeLinejoin="round" />
      <circle cx={cx} cy={457} r="56" fill="white" fillOpacity="0.78" />
      <circle cx={cx} cy={457} r="28" fill={fill} />
    </svg>
  );
}

function NodeCursorsLayer({
  plates,
  plateNodes,
  selectedPlateId,
  selectedNodeId,
  onNodeClick,
}: {
  plates: PlateGeometryBundle[];
  plateNodes: Record<PlateId, NodeConfig[]>;
  selectedPlateId: string | null;
  selectedNodeId: string | null;
  onNodeClick: (nodeId: string) => void;
}) {
  const activePlate = selectedPlateId ? plates.find((p) => p.id === selectedPlateId) : null;
  if (!activePlate) return null;
  const nodes = plateNodes[activePlate.id as PlateId] ?? [];
  const nodeZ = BASE_DEPTH * SELECTED_DEPTH_SCALE + 10;

  return (
    <>
      {nodes.map((node) => {
        const isSelected = node.id === selectedNodeId;
        const tone = resolveCursorTone(node);
        const colorCls =
          tone === "red"
            ? "d3-node-cursor--red"
            : tone === "orange"
              ? "d3-node-cursor--orange"
              : tone === "yellow"
                ? "d3-node-cursor--yellow"
                : "d3-node-cursor--blue";
        const selectedCls = isSelected ? " d3-node-cursor--selected" : "";
        return (
          <Html
            key={node.id}
            position={[
              node.sceneX ?? activePlate.centroid.x + node.offsetX * NODE_SPACING_SCALE,
              node.sceneY ?? activePlate.centroid.y + (node.offsetY ?? 0),
              nodeZ,
            ]}
            zIndexRange={[200, 100]}
          >
            <div
              className={`d3-node-cursor ${colorCls}${selectedCls}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                onNodeClick(node.id);
              }}
            >
              <CursorPinSvg tone={tone} />
              <div className="d3-node-cursor-pulse" />
              <span
                className={`d3-node-label${tone === "red" ? " d3-node-label--red" : tone === "orange" ? " d3-node-label--orange" : tone === "yellow" ? " d3-node-label--yellow" : ""}`}
              >
                {node.name}
              </span>
            </div>
          </Html>
        );
      })}
    </>
  );
}

function PlateMesh({
  plate,
  onToggle,
  registerVisual,
  topTexture,
}: {
  plate: PlateGeometryBundle;
  onToggle: (id: string) => void;
  registerVisual: (id: string, value: PlateVisualRef | null) => void;
  topTexture: Texture | null;
}) {
  const groupRef = useRef<Group>(null);
  const pulseRef = useRef({ value: 0 });
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());

  useEffect(() => {
    if (!topTexture) return;
    const nextAnisotropy = Math.max(1, maxAnisotropy || 1);
    if (topTexture.anisotropy === nextAnisotropy) return;
    topTexture.anisotropy = nextAnisotropy;
    topTexture.needsUpdate = true;
  }, [maxAnisotropy, topTexture]);

  const topMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color("#ffffff"),
        side: DoubleSide,
        map: topTexture,
        toneMapped: false,
        transparent: false,
        opacity: 1,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    [topTexture],
  );

  const topScanTexture = useMemo(() => createTopScanTexture(), []);

  const topScanMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color("#b9fbff"),
        alphaMap: topScanTexture,
        transparent: true,
        opacity: 0,
        side: DoubleSide,
        blending: AdditiveBlending,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [topScanTexture],
  );

  const sideMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: new Color("#94c8ef"),
        roughness: 0.42,
        metalness: 0.24,
        emissive: new Color("#49cbff"),
        emissiveIntensity: 0.25,
        transparent: true,
        opacity: 0.66,
        side: DoubleSide,
        forceSinglePass: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 2,
      }),
    [],
  );

  const sideLineMaterial = useMemo(
    () =>
      new LineBasicMaterial({
        color: new Color("#8ee8ff"),
        transparent: true,
        opacity: 0.16,
        blending: AdditiveBlending,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  const edgeMaterial = useMemo(
    () =>
      new LineBasicMaterial({
        color: new Color("#5fd7ff"),
        transparent: true,
        opacity: 0.2,
        blending: AdditiveBlending,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  useEffect(() => {
    if (!groupRef.current) return;
    registerVisual(plate.id, {
      group: groupRef.current,
      topScanMaterial,
      topScanTexture,
      sideMaterial,
      sideLineMaterial,
      edgeMaterial,
      pulse: pulseRef.current,
    });

    return () => {
      registerVisual(plate.id, null);
    };
  }, [plate.id, topScanMaterial, topScanTexture, sideMaterial, sideLineMaterial, edgeMaterial, registerVisual]);

  useEffect(
    () => () => {
      plate.geometry.dispose();
      plate.topOverlayGeometry.dispose();
      plate.sideLinesGeometry.dispose();
      plate.edgeGeometry.dispose();
      topMaterial.dispose();
      topScanMaterial.dispose();
      topScanTexture.dispose();
      sideMaterial.dispose();
      sideLineMaterial.dispose();
      edgeMaterial.dispose();
    },
    [plate, topMaterial, topScanMaterial, topScanTexture, sideMaterial, sideLineMaterial, edgeMaterial],
  );

  return (
    <group
      ref={groupRef}
      onPointerOver={() => {
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "default";
      }}
    >
      <mesh
        geometry={plate.geometry}
        renderOrder={1}
      >
        <primitive object={topMaterial} attach="material-0" />
        <primitive object={sideMaterial} attach="material-1" />
      </mesh>

      <mesh
        geometry={plate.topOverlayGeometry}
        renderOrder={7}
        onPointerDown={(event) => {
          event.stopPropagation();
          onToggle(plate.id);
        }}
      >
        <primitive object={topScanMaterial} attach="material" />
      </mesh>

      <lineSegments geometry={plate.sideLinesGeometry} renderOrder={5}>
        <primitive object={sideLineMaterial} attach="material" />
      </lineSegments>

      <lineSegments geometry={plate.edgeGeometry} renderOrder={6}>
        <primitive object={edgeMaterial} attach="material" />
      </lineSegments>
    </group>
  );
}

function PlateScene({
  plates,
  plateNodes,
  onToggle,
  registerVisual,
  topTexture,
  selectedPlateId,
  selectedNodeId,
  onNodeClick,
}: {
  plates: PlateGeometryBundle[];
  plateNodes: Record<PlateId, NodeConfig[]>;
  onToggle: (id: string) => void;
  registerVisual: (id: string, value: PlateVisualRef | null) => void;
  topTexture: Texture | null;
  selectedPlateId: string | null;
  selectedNodeId: string | null;
  onNodeClick: (nodeId: string) => void;
}) {
  const visualsRef = useRef<Record<string, PlateVisualRef>>({});

  const registerVisualWithStore = useCallback(
    (id: string, value: PlateVisualRef | null) => {
      if (value) {
        visualsRef.current[id] = value;
      } else {
        delete visualsRef.current[id];
      }
      registerVisual(id, value);
    },
    [registerVisual],
  );

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    plates.forEach((plate) => {
      const visual = visualsRef.current[plate.id];
      if (!visual) return;

      const wave = (Math.sin(t * 2.25) + 1) * 0.5;
      const pulse = visual.pulse.value;

      visual.topScanMaterial.opacity = pulse * (0.16 + wave * 0.1);
      visual.topScanTexture.offset.x = (t * 0.26) % 1;
      visual.sideMaterial.emissiveIntensity = 0.2 + pulse * (0.9 + wave * 0.28);
      visual.sideMaterial.opacity = 0.6 + pulse * 0.22;
      visual.sideLineMaterial.opacity = 0.18 + pulse * (0.38 + wave * 0.12);
      visual.edgeMaterial.opacity = 0.24 + pulse * (0.5 + wave * 0.16);
      visual.group.position.z = MathUtils.lerp(visual.group.position.z, 0, Math.min(1, delta * 9));
    });
  });

  return (
    <>
      <ambientLight intensity={0.86} color="#f4fbff" />
      <directionalLight position={[380, -620, 860]} intensity={1.18} color="#ffffff" />
      <pointLight position={[200, 140, 320]} intensity={1.2} color="#79d9ff" />
      <pointLight position={[-260, -140, 220]} intensity={0.56} color="#8ea8ff" />

      <group scale={[SCENE_SCALE_XY, SCENE_SCALE_XY, 1]} position={[0, 14, 0]}>
        {plates.map((plate) => (
          <PlateMesh
            key={plate.id}
            plate={plate}
            onToggle={onToggle}
            registerVisual={registerVisualWithStore}
            topTexture={topTexture}
          />
        ))}
        <NodeCursorsLayer
          plates={plates}
          plateNodes={plateNodes}
          selectedPlateId={selectedPlateId}
          selectedNodeId={selectedNodeId}
          onNodeClick={onNodeClick}
        />
      </group>
    </>
  );
}

export function D3SandboxThreeMvp(props: D3SandboxProps) {
  const { username, isSelfCenterNode: runtimeIsSelfCenterNode } = useAppRuntime();
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const infoCanvasRef = useRef<HTMLDivElement>(null);
  const infoInnerRef = useRef<HTMLDivElement>(null);
  const loadedTextureRef = useRef<Texture | null>(null);
  const selectedPlateIdRef = useRef<string | null>(null);
  const canvasOpenRef = useRef(false);
  const sceneReadyRef = useRef(false);

  const visualRefs = useRef<Record<string, PlateVisualRef>>({});
  const [selectedPlateId, setSelectedPlateId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [plates, setPlates] = useState<PlateGeometryBundle[]>([]);
  const [desktopSvgMarkup, setDesktopSvgMarkup] = useState<string | null>(null);
  const [topTexture, setTopTexture] = useState<Texture | null>(null);
  const [totalFiles, setTotalFiles] = useState(0);
  const [registeredVisualCount, setRegisteredVisualCount] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const { visible, onSectorChange, onNodeSelect, selfNodePlacement, selectionRevision } = props;
  const selfCenterEnabled = props.isSelfCenterNode ?? false;
  const selfPlacementPlateId = selfNodePlacement?.plateId ?? null;
  const authHeaders = useMemo(
    () => createNodeAuthHeaders(buildNodeAuthContext({
      account: username,
      isSelfCenterNode: runtimeIsSelfCenterNode,
    })),
    [runtimeIsSelfCenterNode, username],
  );

  const plateNodes = useMemo(
    () => buildPlateNodes(props.selfNodeName ?? DEFAULT_SELF_NODE_NAME, selfCenterEnabled, props.selfNodePlacement ?? null),
    [props.selfNodeName, selfCenterEnabled, props.selfNodePlacement],
  );

  useEffect(() => {
    sceneReadyRef.current = sceneReady;
  }, [sceneReady]);

  useEffect(() => {
    let active = true;

    fetch(DESKTOP_SVG_URL)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("desktop svg fetch failed");
        }
        return response.text();
      })
      .then((svgMarkup) => {
        if (!active) return;
        setDesktopSvgMarkup(svgMarkup);
        const paths = extractDesktopMaskPaths(svgMarkup);
        setPlates(buildPlateGeometries(paths));
      })
      .catch(() => {
        if (!active) return;
        setDesktopSvgMarkup(null);
        setPlates(buildPlateGeometries([...DESKTOP_MASK_PATHS_FALLBACK]));
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!desktopSvgMarkup) {
      setTopTexture(null);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;

    objectUrl = URL.createObjectURL(new Blob([desktopSvgMarkup], { type: "image/svg+xml;charset=utf-8" }));
    const image = new Image();
    image.decoding = "async";

    image.onload = () => {
      if (!active) {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
        return;
      }

      const oversample = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
      const probeCanvas = document.createElement("canvas");
      const probeContext =
        probeCanvas.getContext("webgl2") ??
        probeCanvas.getContext("webgl") ??
        probeCanvas.getContext("experimental-webgl");
      const maxTextureSize = isWebGlLikeContext(probeContext)
        ? Number(probeContext.getParameter(probeContext.MAX_TEXTURE_SIZE))
        : 4096;
      const targetWidth = Math.max(1, Math.round(SVG_WIDTH * oversample));
      const targetHeight = Math.max(1, Math.round(SVG_HEIGHT * oversample));
      const textureScale = Math.min(1, maxTextureSize / targetWidth, maxTextureSize / targetHeight);

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(targetWidth * textureScale));
      canvas.height = Math.max(1, Math.round(targetHeight * textureScale));

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setTopTexture(null);
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.magFilter = LinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 1;
      texture.needsUpdate = true;

      if (loadedTextureRef.current && loadedTextureRef.current !== texture) {
        loadedTextureRef.current.dispose();
      }
      loadedTextureRef.current = texture;
      setTopTexture(texture);

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };

    image.onerror = () => {
      if (!active) return;
      setTopTexture(null);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };

    image.src = objectUrl;

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
      if (loadedTextureRef.current) {
        loadedTextureRef.current.dispose();
        loadedTextureRef.current = null;
      }
    };
  }, [desktopSvgMarkup]);

  useEffect(() => {
    let active = true;
    const account = encodeURIComponent((username || "").trim() || "本机节点");
    fetch(`/api/database/metrics?account=${account}`, {
      headers: authHeaders,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Metrics | null) => {
        if (active && data?.totalFiles != null) setTotalFiles(data.totalFiles);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [authHeaders, username]);

  const registerVisual = useCallback((id: string, value: PlateVisualRef | null) => {
    if (value) {
      visualRefs.current[id] = value;
      const isSelected = selectedPlateIdRef.current === id;
      value.group.scale.z = 1;
      value.pulse.value = 0;

      if (isSelected && sceneReadyRef.current) {
        gsap.to(value.group.scale, {
          z: SELECTED_DEPTH_SCALE,
          duration: 0.5,
          ease: "expo.out",
          overwrite: true,
        });
        gsap.to(value.pulse, {
          value: 1,
          duration: 0.45,
          ease: "sine.out",
          overwrite: true,
        });
      }
      setRegisteredVisualCount(Object.keys(visualRefs.current).length);
      return;
    }
    delete visualRefs.current[id];
    setRegisteredVisualCount(Object.keys(visualRefs.current).length);
  }, []);

  const handleToggle = useCallback((plateId: string) => {
    if (selectedPlateIdRef.current !== plateId) {
      setSelectedNodeId(null);
      onNodeSelect(null);
    }
    selectedPlateIdRef.current = plateId;
    setSelectedPlateId(plateId);
    onSectorChange(mapPlateToSector(plateId));
  }, [onNodeSelect, onSectorChange]);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    onNodeSelect(nodeId);
  }, [onNodeSelect]);

  useEffect(() => {
    if (!visible) {
      selectedPlateIdRef.current = null;
      setSelectedPlateId(null);
      setSelectedNodeId(null);
      onNodeSelect(null);
      return;
    }

    const defaultPlateId = selfPlacementPlateId ?? DEFAULT_ACTIVE_PLATE_ID;
    const raf = window.requestAnimationFrame(() => {
      selectedPlateIdRef.current = defaultPlateId;
      setSelectedPlateId(defaultPlateId);
      onSectorChange(mapPlateToSector(defaultPlateId));
    });
    const nodeTimer = window.setTimeout(() => {
      if (visible) {
        setSelectedNodeId("node-center-red");
        onNodeSelect("node-center-red");
      }
    }, AUTO_SELECT_NODE_DELAY_MS);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(nodeTimer);
    };
  }, [visible, selfPlacementPlateId, onNodeSelect, onSectorChange]);

  useEffect(() => {
    if (!visible || plates.length === 0) {
      setSceneReady(false);
      return;
    }
    if (registeredVisualCount < plates.length) {
      setSceneReady(false);
      return;
    }

    let frameA = 0;
    let frameB = 0;
    frameA = window.requestAnimationFrame(() => {
      frameB = window.requestAnimationFrame(() => {
        setSceneReady(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(frameA);
      window.cancelAnimationFrame(frameB);
    };
  }, [visible, plates.length, registeredVisualCount]);

  useEffect(() => {
    if (!visible) return;
    if (!selectionRevision) return;
    const plateId = selfPlacementPlateId;
    if (!plateId) return;

    selectedPlateIdRef.current = plateId;
    setSelectedPlateId(plateId);
    setSelectedNodeId("node-center-red");
    onSectorChange(mapPlateToSector(plateId));
    onNodeSelect("node-center-red");
  }, [visible, selectionRevision, selfPlacementPlateId, onNodeSelect, onSectorChange]);

  useGSAP(
    () => {
      if (!props.visible) return;
      if (!headerRef.current || !canvasWrapRef.current) return;

      const tl = gsap.timeline();
      tl.fromTo(
        headerRef.current,
        { autoAlpha: 0, y: -10 },
        { autoAlpha: 1, y: 0, duration: 0.42, ease: "power2.out" },
      );
      tl.fromTo(
        canvasWrapRef.current,
        { autoAlpha: 0, scale: 0.97 },
        { autoAlpha: 1, scale: 1, duration: 0.62, ease: "power2.out" },
        0.04,
      );

      return () => {
        tl.kill();
      };
    },
    { dependencies: [props.visible], scope: rootRef },
  );

  useGSAP(
    () => {
      const canvas = infoCanvasRef.current;
      const inner = infoInnerRef.current;
      if (!canvas || !inner) return;

      if (selectedNodeId) {
        if (canvasOpenRef.current) {
          const tl = gsap.timeline();
          tl.to(inner, { opacity: 0, duration: 0.13, ease: "power1.in" });
          tl.to(inner, { opacity: 1, duration: 0.22, ease: "power2.out" });
        } else {
          canvasOpenRef.current = true;
          gsap.to(canvas, { height: INFO_CANVAS_HEIGHT, autoAlpha: 1, duration: 0.38, ease: "power2.out" });
          gsap.fromTo(inner, { opacity: 0 }, { opacity: 1, duration: 0.28, delay: 0.18, ease: "power2.out" });
        }
      } else {
        canvasOpenRef.current = false;
        gsap.to(canvas, { height: 0, autoAlpha: 0, duration: 0.26, ease: "power2.in" });
      }
    },
    { dependencies: [selectedNodeId], scope: rootRef },
  );

  useGSAP(
    () => {
      if (!props.visible) return;
      if (!sceneReady) return;

      Object.entries(visualRefs.current).forEach(([plateId, visual]) => {
        const targetScale = selectedPlateId === plateId ? SELECTED_DEPTH_SCALE : 1;
        const duration = targetScale > visual.group.scale.z ? 0.5 : 0.4;
        gsap.to(visual.group.scale, {
          z: targetScale,
          duration,
          ease: targetScale > 1 ? "expo.out" : "power2.inOut",
          overwrite: true,
        });

        gsap.to(visual.pulse, {
          value: selectedPlateId === plateId ? 1 : 0,
          duration: selectedPlateId === plateId ? 0.45 : 0.3,
          ease: "sine.out",
          overwrite: true,
        });
      });
    },
    { dependencies: [selectedPlateId, props.visible, sceneReady, plates.length], scope: rootRef },
  );

  if (!props.visible) return null;

  const allNodes: NodeConfig[] = Object.values(plateNodes).flat();
  const activeNode = selectedNodeId ? allNodes.find((n) => n.id === selectedNodeId) : null;
  const isSelfNode = activeNode ? isSelfNodeId(activeNode.id) : false;
  const isCenterNode = Boolean(activeNode && (activeNode.isCenter || activeNode.isRed));
  const isSelfCenterNode = Boolean(isSelfNode && activeNode?.isRed);
  const isOrangeCenterNode = Boolean(isCenterNode && !isSelfCenterNode);
  const activeMock = activeNode && !isSelfNode ? NODE_MOCK[activeNode.id] : null;
  const isSelfOrdinaryNode = isSelfNode && !isCenterNode;
  const activeTone = activeNode ? resolveCursorTone(activeNode) : null;
  const activeCursorTokens = activeTone ? getCursorTokens(activeTone) : getCursorTokens("blue");

  return (
    <div ref={rootRef} className="d3viz-root d3three-root">
      <header ref={headerRef} className="d1tl-header d3viz-header d3three-header">
        <span className="d1tl-header-dot d3viz-dot" />
        <span className="d1tl-header-title">核心地域态势</span>
      </header>

      {/* Info canvas — CSS-first hidden; GSAP opens/closes */}
      <div ref={infoCanvasRef} className="d3-info-canvas">
        <div ref={infoInnerRef} className="d3-info-canvas-inner">
          {activeNode && (
            <>
              <div className="d3-info-id-col">
                <div className="d3-info-node-head">
                  <svg
                    className="d3-info-cursor-thumb"
                    viewBox={activeCursorTokens.vb}
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <defs>
                      <linearGradient id={`tg-${activeCursorTokens.gradId}`} x1="50%" y1="0%" x2="50%" y2="100%">
                        <stop offset="0%" stopColor={activeCursorTokens.grad} />
                        <stop offset="100%" stopColor={activeCursorTokens.fill} />
                      </linearGradient>
                    </defs>
                    <path
                      d={activeCursorTokens.path}
                      fill={`url(#tg-${activeCursorTokens.gradId})`}
                      stroke="white"
                      strokeWidth="9"
                      strokeLinejoin="round"
                    />
                    <circle cx={activeCursorTokens.cx} cy={457} r="56" fill="white" fillOpacity="0.78" />
                    <circle
                      cx={activeCursorTokens.cx}
                      cy={457}
                      r="28"
                      fill={activeCursorTokens.fill}
                    />
                  </svg>
                  <div className="d3-info-node-text">
                    <span
                      className={`d3-info-node-name${isSelfCenterNode ? " d3-info-node-name--red" : isOrangeCenterNode ? " d3-info-node-name--orange" : ""}`}
                    >
                      {activeNode.name}
                    </span>
                    {isCenterNode ? (
                      <span className={`d3-info-self-tag ${isSelfCenterNode ? "d3-info-self-tag--red" : "d3-info-self-tag--center-orange"}`}>
                        中心节点
                      </span>
                    ) : isSelfNode ? (
                      <span className={`d3-info-self-tag${isSelfCenterNode ? " d3-info-self-tag--red" : ""}`}>
                        我的节点
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="d3-info-metrics">
                {isSelfOrdinaryNode ? (
                  <>
                    <div className="d3-info-metric d3-info-metric--self-normal">
                      <span className="d3-info-metric-val d3-info-metric-val--self-normal">67</span>
                      <span className="d3-info-metric-lbl d3-info-metric-lbl--self-normal">活跃度%</span>
                    </div>
                    <div className="d3-info-metric d3-info-metric--self-normal">
                      <span className="d3-info-metric-val d3-info-metric-val--self-normal">8</span>
                      <span className="d3-info-metric-lbl d3-info-metric-lbl--self-normal">连接数</span>
                    </div>
                    <div className="d3-info-metric d3-info-metric--self-normal">
                      <span className="d3-info-metric-val d3-info-metric-val--self-normal">847</span>
                      <span className="d3-info-metric-lbl d3-info-metric-lbl--self-normal">记录总数</span>
                    </div>
                  </>
                ) : isCenterNode ? (
                  <>
                    <div className="d3-info-metric">
                      <span className={`d3-info-metric-val ${isSelfCenterNode ? "d3-info-metric-val--red" : "d3-info-metric-val--orange"}`}>
                        {totalFiles.toLocaleString()}
                      </span>
                      <span className="d3-info-metric-lbl">核心数据 (份)</span>
                    </div>
                    <div className="d3-info-metric">
                      <span className="d3-info-metric-val">47</span>
                      <span className="d3-info-metric-lbl">今日更新</span>
                    </div>
                    <div className="d3-info-metric">
                      <span className="d3-info-metric-val">312</span>
                      <span className="d3-info-metric-lbl">调用次数</span>
                    </div>
                    <div className="d3-info-metric">
                      <span className="d3-info-metric-val">99.8%</span>
                      <span className="d3-info-metric-lbl">可用率</span>
                    </div>
                  </>
                ) : activeMock ? (
                  <>
                    <div className="d3-info-metric">
                      <span className="d3-info-metric-val">{activeMock.v1}</span>
                      <span className="d3-info-metric-lbl">{activeMock.l1}</span>
                    </div>
                    <div className="d3-info-metric">
                      <span className="d3-info-metric-val">{activeMock.v2}</span>
                      <span className="d3-info-metric-lbl">{activeMock.l2}</span>
                    </div>
                    <div className="d3-info-metric">
                      <span className="d3-info-metric-val">{activeMock.v3}</span>
                      <span className="d3-info-metric-lbl">{activeMock.l3}</span>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="d3-info-status-col">
                <span
                  className={`d3-info-badge ${isCenterNode ? (isSelfCenterNode ? "d3-info-badge--restricted" : "d3-info-badge--center-orange") : isSelfNode ? "d3-info-badge--self-normal" : "d3-info-badge--online"}`}
                >
                  {isCenterNode ? "中心权限" : "普通权限"}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div ref={canvasWrapRef} className="d3three-canvas-wrap">
        <Canvas
          className="d3three-canvas"
          dpr={[1.5, 3]}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance", logarithmicDepthBuffer: true }}
          camera={{
            fov: 36,
            near: 10,
            far: 3000,
            position: [72, -900, 980],
          }}
          onCreated={({ camera }) => {
            camera.lookAt(0, -18, 90);
          }}
          onPointerMissed={() => {
            if (selectedNodeId !== null) {
              setSelectedNodeId(null);
              onNodeSelect(null);
            } else if (selectedPlateId !== null) {
              selectedPlateIdRef.current = null;
              setSelectedPlateId(null);
              onSectorChange("node-current");
            }
          }}
        >
          <PlateScene
            plates={plates}
            plateNodes={plateNodes}
            onToggle={handleToggle}
            registerVisual={registerVisual}
            topTexture={topTexture}
            selectedPlateId={selectedPlateId}
            selectedNodeId={selectedNodeId}
            onNodeClick={handleNodeClick}
          />
        </Canvas>
      </div>
    </div>
  );
}
