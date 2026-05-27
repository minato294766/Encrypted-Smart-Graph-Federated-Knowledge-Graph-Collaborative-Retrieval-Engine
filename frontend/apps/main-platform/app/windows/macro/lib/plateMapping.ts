"use client";

export type RuntimePlateId = "plate-1" | "plate-2" | "plate-3" | "plate-4" | "plate-5";

const PLATE_IDS: RuntimePlateId[] = ["plate-1", "plate-2", "plate-3", "plate-4", "plate-5"];
const DEFAULT_VIEWBOX_WIDTH = 1280;
const DEFAULT_VIEWBOX_HEIGHT = 1080;
const SPREAD_DISTANCE = 12;

const DESKTOP_MASK_PATHS_FALLBACK = [
  "M200.5 702.5V625H462.5L472.5 678.5L473 683V842.5H464L436 850L355 870.5L350.5 871.5L347 872H253L250 871L244.5 868.5L241 866L238.5 863.5L235.5 860L232.5 855L229.5 847.5L223.5 816.5L212 762L200.5 702.5Z",
  "M596.5 238H483V305.5H461.5V487L645.5 489V596H749.5L759 593L770.5 587.5L780 582L789.5 574.5L799 567L808.5 561L817.5 556L827.5 552L837 548.5L851 546L863 545H886V643.5L944.5 689.5L1007 611.5L1011.5 604L1015.5 595.5L1018 587L1019.5 580V550H1041.5L1051 549.5L1062.5 547.5L1074.5 543L1087 537L1095.5 531L1105 523L1143 478.5V452.5H1090V326H1004L974.5 310H912L907 311L903 313L900 315L897 317.5L894.5 320.5L892.5 323.5L891 326L889.5 329.5L888.5 333V380.5H618V260L617 256.5L614.5 251L610.5 245.5L606.5 242.5L602 239.5L596.5 238Z",
  "M445 23L450 23.5L455 25L458.5 27L464 31L469.5 36L475 42.5L478 47L480 51.5L481 54L481.5 56V185L481 185.5L479.5 186.5L478 187.5L476.5 189L475 190.5L474 192L473.5 193.5V291.5H443.5V517.5L444 523L444.5 527.5L460.5 617L263 617.5V613.5L266.5 158.5L267 156.5L269 153L271.5 150L276.5 145.5L428 27L432 25L437.5 23.5L441.5 23H445Z",
  "M461 516V498.5H633.5V602H758.5L764.5 601L770 599L778.5 594L795.5 582.5L808.5 573.5L816.5 569L824 565.5L832 562.5L839 560L848.5 557.5L859 556.5H877L877.5 645L941.5 693.5L929 709.5L924 718L920.5 726L911 748L901 772.5L892.5 794.5L882.5 825.5H516L514.5 820L461 516Z",
  "M557.5 1002L528 839H878.5L853 942L842.5 987L839.5 997.5L837 1007.5L833 1016.5L828.5 1024L822.5 1031L814.5 1037.5L809 1040.5H598L592.5 1040L583 1036.5L577.5 1033L572.5 1028.5L567.5 1023.5L563.5 1017L560 1009L557.5 1002Z",
] as const;

export interface PlateRegion {
  plateId: RuntimePlateId;
  pathD: string;
  centroidX: number;
  centroidY: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PlateMapDefinition {
  viewBoxWidth: number;
  viewBoxHeight: number;
  regions: PlateRegion[];
}

function parseViewBox(svgMarkup: string): { width: number; height: number } {
  const xml = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const svgNode = xml.querySelector("svg");
  const viewBox = svgNode?.getAttribute("viewBox")?.trim();
  if (viewBox) {
    const values = viewBox
      .split(/\s+/)
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v));
    if (values.length === 4 && values[2] > 0 && values[3] > 0) {
      return { width: values[2], height: values[3] };
    }
  }
  return { width: DEFAULT_VIEWBOX_WIDTH, height: DEFAULT_VIEWBOX_HEIGHT };
}

export function extractPlatePathDefs(svgMarkup: string): string[] {
  const xml = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");

  const maskPaths = Array.from(xml.querySelectorAll("mask path[d]"))
    .map((node) => node.getAttribute("d")?.trim())
    .filter((value): value is string => Boolean(value));
  if (maskPaths.length >= 5) {
    return maskPaths.slice(0, 5);
  }

  const regularPaths = Array.from(xml.querySelectorAll("path[d]"))
    .map((node) => node.getAttribute("d")?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value) => value.length > 24);

  const deduped = Array.from(new Set(regularPaths));
  if (deduped.length >= 5) {
    return deduped.slice(0, 5);
  }

  return [...DESKTOP_MASK_PATHS_FALLBACK];
}

function createSamplePath(pathD: string, viewBoxWidth: number, viewBoxHeight: number): SVGPathElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${viewBoxWidth} ${viewBoxHeight}`);
  svg.style.position = "absolute";
  svg.style.width = "0";
  svg.style.height = "0";
  svg.style.opacity = "0";
  svg.style.pointerEvents = "none";

  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", pathD);
  svg.appendChild(path);
  document.body.appendChild(svg);
  return path;
}

function removeSamplePath(path: SVGPathElement) {
  path.ownerSVGElement?.remove();
}

function getPathCentroid(path: SVGPathElement): { x: number; y: number } {
  const length = path.getTotalLength();
  const steps = Math.max(50, Math.ceil(length / 12));
  let sumX = 0;
  let sumY = 0;

  for (let i = 0; i < steps; i += 1) {
    const point = path.getPointAtLength((length * i) / steps);
    sumX += point.x;
    sumY += point.y;
  }

  return {
    x: sumX / steps,
    y: sumY / steps,
  };
}

function mapIndicesToPlateIds(regions: Array<{ index: number; centroidX: number; centroidY: number }>) {
  const idByIndex = new Map<number, RuntimePlateId>();
  const remaining = regions.map((item) => item.index);

  const removeIndex = (indexToRemove: number) => {
    const idx = remaining.indexOf(indexToRemove);
    if (idx >= 0) remaining.splice(idx, 1);
  };

  const top = regions.reduce((best, item) => (item.centroidY < best.centroidY ? item : best));
  idByIndex.set(top.index, "plate-1");
  removeIndex(top.index);

  const bottom = regions.reduce((best, item) => (item.centroidY > best.centroidY ? item : best));
  idByIndex.set(bottom.index, "plate-2");
  removeIndex(bottom.index);

  const remainingRegions = regions.filter((item) => remaining.includes(item.index));
  const left = remainingRegions.reduce((best, item) => (item.centroidX < best.centroidX ? item : best));
  idByIndex.set(left.index, "plate-3");
  removeIndex(left.index);

  const tail = regions
    .filter((item) => remaining.includes(item.index))
    .sort((a, b) => a.centroidY - b.centroidY);

  if (tail[0]) idByIndex.set(tail[0].index, "plate-4");
  if (tail[1]) idByIndex.set(tail[1].index, "plate-5");

  return idByIndex;
}

export function buildPlateMapFromSvgMarkup(svgMarkup: string): PlateMapDefinition {
  const { width, height } = parseViewBox(svgMarkup);
  const pathDefs = extractPlatePathDefs(svgMarkup).slice(0, 5);

  const sampled = pathDefs.map((pathD, index) => {
    const path = createSamplePath(pathD, width, height);
    const bbox = path.getBBox();
    const centroid = getPathCentroid(path);
    removeSamplePath(path);

    return {
      index,
      pathD,
      centroidX: centroid.x,
      centroidY: centroid.y,
      bbox,
    };
  });

  const idByIndex = mapIndicesToPlateIds(sampled);

  const regions = sampled
    .map((item) => {
      const plateId = idByIndex.get(item.index);
      if (!plateId) return null;
      return {
        plateId,
        pathD: item.pathD,
        centroidX: item.centroidX,
        centroidY: item.centroidY,
        bbox: {
          x: item.bbox.x,
          y: item.bbox.y,
          width: item.bbox.width,
          height: item.bbox.height,
        },
      } satisfies PlateRegion;
    })
    .filter((item): item is PlateRegion => item !== null)
    .sort((a, b) => PLATE_IDS.indexOf(a.plateId) - PLATE_IDS.indexOf(b.plateId));

  return {
    viewBoxWidth: width,
    viewBoxHeight: height,
    regions,
  };
}

export function createPlateHitTester(map: PlateMapDefinition) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(map.viewBoxWidth));
  canvas.height = Math.max(1, Math.round(map.viewBoxHeight));
  const ctx = canvas.getContext("2d");
  const entries = map.regions.map((region) => ({
    region,
    path2d: new Path2D(region.pathD),
  }));

  return (x: number, y: number): PlateRegion | null => {
    if (!ctx) return null;
    const found = entries.find(({ path2d }) => ctx.isPointInPath(path2d, x, y));
    return found?.region ?? null;
  };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function mapPointBetweenPlateMaps(params: {
  sourceMap: PlateMapDefinition;
  targetMap: PlateMapDefinition;
  plateId: RuntimePlateId;
  sourceX: number;
  sourceY: number;
}) {
  const sourceRegion = params.sourceMap.regions.find((region) => region.plateId === params.plateId);
  const targetRegion = params.targetMap.regions.find((region) => region.plateId === params.plateId);
  if (!sourceRegion || !targetRegion) {
    return null;
  }

  const sourceWidth = Math.max(1e-6, sourceRegion.bbox.width);
  const sourceHeight = Math.max(1e-6, sourceRegion.bbox.height);

  const ratioX = clamp01((params.sourceX - sourceRegion.bbox.x) / sourceWidth);
  const ratioY = clamp01((params.sourceY - sourceRegion.bbox.y) / sourceHeight);

  return {
    x: targetRegion.bbox.x + ratioX * targetRegion.bbox.width,
    y: targetRegion.bbox.y + ratioY * targetRegion.bbox.height,
    ratioX,
    ratioY,
  };
}

export function mapDesktopPointToScenePoint(params: {
  desktopMap: PlateMapDefinition;
  plateId: RuntimePlateId;
  desktopX: number;
  desktopY: number;
}) {
  const region = params.desktopMap.regions.find((entry) => entry.plateId === params.plateId);
  if (!region) return null;

  const centerX = params.desktopMap.viewBoxWidth / 2;
  const centerY = params.desktopMap.viewBoxHeight / 2;
  const centroidSceneX = region.centroidX - centerX;
  const centroidSceneY = centerY - region.centroidY;

  const len = Math.hypot(centroidSceneX, centroidSceneY);
  const spreadX = len > 1e-6 ? (centroidSceneX / len) * SPREAD_DISTANCE : 0;
  const spreadY = len > 1e-6 ? (centroidSceneY / len) * SPREAD_DISTANCE : 0;

  return {
    sceneX: params.desktopX - centerX + spreadX,
    sceneY: centerY - params.desktopY + spreadY,
  };
}
