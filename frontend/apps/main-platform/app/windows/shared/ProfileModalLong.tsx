"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from "react";
import Cropper, { type Area } from "react-easy-crop";
import { useAppRuntime, type SavedNodeLocation } from "@/app/components/runtime/AppRuntimeProvider";
import { coerceClientError } from "./error-utils";
import { adminSubmitRequest } from "@/app/lib/client/admin-adapter";
import {
  buildPlateMapFromSvgMarkup,
  createPlateHitTester,
  mapDesktopPointToScenePoint,
  mapPointBetweenPlateMaps,
  type PlateMapDefinition,
} from "../macro/lib/plateMapping";

const NEW_SVG_URL = "/NEW.svg";
const DESKTOP_SVG_URL = "/Desktop.svg";
const LOCATION_MAP_BACKGROUND_URL = "/location-map-bg.png";
const AVATAR_PREVIEW_SIZE = 256;
const AVATAR_EXPORT_SIZE = 512;
const AVATAR_SUCCESS_HINT_DELAY_MS = 800;
const APPLY_SIMULATION_MS = 1300;
const NAME_APPLY_SIMULATION_MS = 5000;
const MAP_CURSOR_TRANSITION_MS = 320;

const MAP_CURSOR_SCALE = 0.12;
const MAP_CURSOR_TIP_X = 397;
const MAP_CURSOR_TIP_Y = 785;
const M3_MAP_BG_SCALE = 1;
const M3_MAP_BG_OFFSET_X_PERCENT = 5.5;
const M3_MAP_BG_OFFSET_Y_PERCENT = 1;
const MAP_CURSOR_PATH =
  "M254.5 609C327.821 697.686 389.473 770.607 397 785C405.498 771.741 458.375 707.807 541 607.5C582.567 549.104 599.532 516.654 614 459.5C620.615 409.584 618.912 383.151 605.5 339C582.976 283.441 564.02 258.184 518.5 224C472.988 197.268 446.632 189.034 398 187.5C345.114 189.605 318.741 197.86 277 224C229.549 258.406 211.828 284.033 189.5 340C176.178 379.831 174.499 406.119 181 459.5C191.438 511.408 212.2 545.796 254.5 609Z";

const M3_PLATE_LABELS: Record<SavedNodeLocation["plateId"], string> = {
  "plate-1": "西北区域",
  "plate-2": "行政区",
  "plate-3": "实战馆区",
  "plate-4": "食堂-宿舍区",
  "plate-5": "教学区",
};

function getM3PlateLabel(plateId: SavedNodeLocation["plateId"]): string {
  return M3_PLATE_LABELS[plateId] ?? plateId;
}

async function loadImageFromSource(src: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = (event) => reject(coerceClientError(event, `image load failed: ${src}`));
    image.src = src;
  });
}

function normalizeCropArea(area: Area, image: HTMLImageElement) {
  const x = Math.max(0, Math.round(area.x));
  const y = Math.max(0, Math.round(area.y));
  const width = Math.max(1, Math.round(area.width));
  const height = Math.max(1, Math.round(area.height));
  const maxWidth = Math.max(1, image.naturalWidth - x);
  const maxHeight = Math.max(1, image.naturalHeight - y);

  return {
    x,
    y,
    width: Math.min(width, maxWidth),
    height: Math.min(height, maxHeight),
  };
}

async function cropAvatarImageToDataUrl(src: string, cropArea: Area, outputSize: number): Promise<string> {
  const image = await loadImageFromSource(src);
  const safeCrop = normalizeCropArea(cropArea, image);

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("canvas context unavailable");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, outputSize, outputSize);
  ctx.drawImage(
    image,
    safeCrop.x,
    safeCrop.y,
    safeCrop.width,
    safeCrop.height,
    0,
    0,
    outputSize,
    outputSize,
  );

  return canvas.toDataURL("image/png");
}

function MapLocationCursorGlyph({ isCenter }: { isCenter: boolean }) {
  const cursorFill = isCenter ? "#dc2626" : "#2FD68A";
  const cursorInner = isCenter ? "#dc2626" : "#167C52";
  return (
    <g className={`global-top-nav__location-cursor-glyph${isCenter ? "" : " global-top-nav__location-cursor-glyph--normal"}`}>
      <g transform={`scale(${MAP_CURSOR_SCALE})`}>
        <g transform={`translate(${-MAP_CURSOR_TIP_X} ${-MAP_CURSOR_TIP_Y})`}>
          <path d={MAP_CURSOR_PATH} fill={cursorFill} stroke="white" strokeWidth="9" strokeLinejoin="round" />
          <circle cx={397} cy={457} r={56} fill="white" fillOpacity={0.8} />
          <circle cx={397} cy={457} r={28} fill={cursorInner} />
        </g>
      </g>
    </g>
  );
}

interface ProfileModalLongProps {
  onClose: () => void;
}

export function ProfileModalLong({ onClose }: ProfileModalLongProps) {
  const {
    username,
    avatarDataUrl,
    setUsername,
    setAvatarDataUrl,
    judgeModelConfigured,
    isSelfCenterNode,
    setIsSelfCenterNode,
    savedNodeLocation,
    setSavedNodeLocation,
  } = useAppRuntime();

  const [draftAvatarSrc, setDraftAvatarSrc] = useState<string | null>(null);
  const [avatarCrop, setAvatarCrop] = useState({ x: 0, y: 0 });
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarCropPixels, setAvatarCropPixels] = useState<Area | null>(null);
  const [draftAvatarPreviewUrl, setDraftAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [draftUsername, setDraftUsername] = useState(username);
  const [m1AvatarHint, setM1AvatarHint] = useState("");
  const [m15NameHint, setM15NameHint] = useState("");
  const [nameApplyState, setNameApplyState] = useState<"idle" | "loading">("idle");

  const [applyState, setApplyState] = useState<"idle" | "loading" | "success" | "failed">("idle");

  const [mapDefinition, setMapDefinition] = useState<PlateMapDefinition | null>(null);
  const [desktopMapDefinition, setDesktopMapDefinition] = useState<PlateMapDefinition | null>(null);
  const hitTesterRef = useRef<ReturnType<typeof createPlateHitTester> | null>(null);
  const [previewLocation, setPreviewLocation] = useState<SavedNodeLocation | null>(savedNodeLocation);
  const previewLocationRef = useRef<SavedNodeLocation | null>(savedNodeLocation);
  const [fadingLocation, setFadingLocation] = useState<SavedNodeLocation | null>(null);
  const [m3Hint, setM3Hint] = useState("");
  const [locationApplyBusy, setLocationApplyBusy] = useState(false);

  const m3MapBgInsetPercent = (1 - M3_MAP_BG_SCALE) * 50;
  const m3MapBgXPercent = m3MapBgInsetPercent + M3_MAP_BG_OFFSET_X_PERCENT;
  const m3MapBgYPercent = m3MapBgInsetPercent + M3_MAP_BG_OFFSET_Y_PERCENT;

  const avatarUploadInputRef = useRef<HTMLInputElement | null>(null);

  const applyTimerRef = useRef<number | null>(null);
  const m1AvatarHintTimerRef = useRef<number | null>(null);
  const m15NameHintTimerRef = useRef<number | null>(null);
  const m3HintTimerRef = useRef<number | null>(null);
  const avatarSuccessTimerRef = useRef<number | null>(null);
  const mapCursorFadeTimerRef = useRef<number | null>(null);
  const nameApplyTimerRef = useRef<number | null>(null);

  const applyMessage = useMemo(() => {
    if (applyState === "success") {
      return isSelfCenterNode ? "申请成功：已具备中心节点资格。" : "已恢复为普通节点身份。";
    }
    if (applyState === "failed") return "申请失败：请先在交互对话窗口完成法官模型配置。";
    return "";
  }, [applyState, isSelfCenterNode]);

  const pushM1AvatarHint = useCallback((nextHint: string) => {
    setM1AvatarHint(nextHint);
    if (m1AvatarHintTimerRef.current !== null) {
      window.clearTimeout(m1AvatarHintTimerRef.current);
    }
    m1AvatarHintTimerRef.current = window.setTimeout(() => {
      setM1AvatarHint("");
    }, 1800);
  }, []);

  const pushM15NameHint = useCallback((nextHint: string) => {
    setM15NameHint(nextHint);
    if (m15NameHintTimerRef.current !== null) {
      window.clearTimeout(m15NameHintTimerRef.current);
    }
    m15NameHintTimerRef.current = window.setTimeout(() => {
      setM15NameHint("");
    }, 1800);
  }, []);

  const pushM3Hint = useCallback((nextHint: string, duration = 2000) => {
    setM3Hint(nextHint);
    if (m3HintTimerRef.current !== null) {
      window.clearTimeout(m3HintTimerRef.current);
    }
    m3HintTimerRef.current = window.setTimeout(() => {
      setM3Hint("");
    }, duration);
  }, []);

  const resetAvatarDraft = useCallback(() => {
    setDraftAvatarSrc(null);
    setAvatarCrop({ x: 0, y: 0 });
    setAvatarZoom(1);
    setAvatarCropPixels(null);
    setDraftAvatarPreviewUrl(null);
  }, []);

  const handleResetAvatarCrop = useCallback(() => {
    if (!draftAvatarSrc) return;
    setAvatarCrop({ x: 0, y: 0 });
    setAvatarZoom(1);
  }, [draftAvatarSrc]);

  const updatePreviewLocationWithFade = useCallback((nextLocation: SavedNodeLocation) => {
    const previous = previewLocationRef.current;

    if (previous) {
      setFadingLocation(previous);
      if (mapCursorFadeTimerRef.current !== null) {
        window.clearTimeout(mapCursorFadeTimerRef.current);
      }
      mapCursorFadeTimerRef.current = window.setTimeout(() => {
        setFadingLocation(null);
      }, MAP_CURSOR_TRANSITION_MS);
    } else {
      setFadingLocation(null);
    }

    previewLocationRef.current = nextLocation;
    setPreviewLocation(nextLocation);
  }, []);

  const buildLocationFromPoint = useCallback(
    (mapX: number, mapY: number, plateId: SavedNodeLocation["plateId"]): SavedNodeLocation | null => {
      if (!mapDefinition || !desktopMapDefinition) return null;

      const mappedDesktop = mapPointBetweenPlateMaps({
        sourceMap: mapDefinition,
        targetMap: desktopMapDefinition,
        plateId,
        sourceX: mapX,
        sourceY: mapY,
      });
      if (!mappedDesktop) return null;

      const mappedScene = mapDesktopPointToScenePoint({
        desktopMap: desktopMapDefinition,
        plateId,
        desktopX: mappedDesktop.x,
        desktopY: mappedDesktop.y,
      });
      if (!mappedScene) return null;

      return {
        plateId,
        mapX,
        mapY,
        mapViewBoxWidth: mapDefinition.viewBoxWidth,
        mapViewBoxHeight: mapDefinition.viewBoxHeight,
        desktopX: mappedDesktop.x,
        desktopY: mappedDesktop.y,
        sceneX: mappedScene.sceneX,
        sceneY: mappedScene.sceneY,
        savedAt: Date.now(),
      };
    },
    [desktopMapDefinition, mapDefinition],
  );

  const normalizeLocationToCurrentMap = useCallback(
    (location: SavedNodeLocation | null): SavedNodeLocation | null => {
      if (!location) return null;
      if (!mapDefinition || !desktopMapDefinition) return location;

      const sameMapSize =
        location.mapViewBoxWidth === mapDefinition.viewBoxWidth &&
        location.mapViewBoxHeight === mapDefinition.viewBoxHeight;

      if (sameMapSize) return location;

      const scaledX = (location.mapX / Math.max(1, location.mapViewBoxWidth)) * mapDefinition.viewBoxWidth;
      const scaledY = (location.mapY / Math.max(1, location.mapViewBoxHeight)) * mapDefinition.viewBoxHeight;
      const remapped = buildLocationFromPoint(scaledX, scaledY, location.plateId);
      if (!remapped) return location;

      return {
        ...remapped,
        savedAt: location.savedAt,
      };
    },
    [buildLocationFromPoint, desktopMapDefinition, mapDefinition],
  );

  const handleAvatarUpload = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      pushM1AvatarHint("仅支持图片文件");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : null;
      if (!src) return;

      const image = new Image();
      image.onload = () => {
        setDraftAvatarSrc(src);
        setAvatarCrop({ x: 0, y: 0 });
        setAvatarZoom(1);
        setAvatarCropPixels(null);
        setDraftAvatarPreviewUrl(null);
      };
      image.src = src;
    };
    reader.readAsDataURL(file);
  }, [pushM1AvatarHint]);

  const handleAvatarCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setAvatarCropPixels(croppedAreaPixels);
  }, []);

  useEffect(() => {
    if (!draftAvatarSrc || !avatarCropPixels) {
      setDraftAvatarPreviewUrl(null);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      void cropAvatarImageToDataUrl(draftAvatarSrc, avatarCropPixels, AVATAR_PREVIEW_SIZE)
        .then((nextPreview) => {
          if (!active) return;
          setDraftAvatarPreviewUrl(nextPreview);
        })
        .catch(() => {
          if (!active) return;
          setDraftAvatarPreviewUrl(null);
        });
    }, 80);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [avatarCropPixels, draftAvatarSrc]);

  const handleApplyAvatar = useCallback(async () => {
    if (!draftAvatarSrc) {
      pushM1AvatarHint("请先上传头像文件");
      return;
    }
    if (!avatarCropPixels) {
      pushM1AvatarHint("请先调整头像裁剪区域");
      return;
    }

    setAvatarBusy(true);
    try {
      const croppedDataUrl = await cropAvatarImageToDataUrl(draftAvatarSrc, avatarCropPixels, AVATAR_EXPORT_SIZE);
      setAvatarDataUrl(croppedDataUrl);
      resetAvatarDraft();

      if (avatarSuccessTimerRef.current !== null) {
        window.clearTimeout(avatarSuccessTimerRef.current);
      }
      avatarSuccessTimerRef.current = window.setTimeout(() => {
        pushM1AvatarHint("头像上传成功，已同步保存");
      }, AVATAR_SUCCESS_HINT_DELAY_MS);
    } catch {
      pushM1AvatarHint("头像处理失败，请重试");
    } finally {
      setAvatarBusy(false);
    }
  }, [avatarCropPixels, draftAvatarSrc, pushM1AvatarHint, resetAvatarDraft, setAvatarDataUrl]);

  const handleSaveUsername = useCallback(() => {
    if (nameApplyState === "loading") return;

    const nextName = draftUsername.trim();
    if (!nextName) {
      pushM15NameHint("节点名称不能为空");
      return;
    }
    if (nextName === username) {
      pushM15NameHint("请填写修改后的名称");
      return;
    }

    if (m15NameHintTimerRef.current !== null) {
      window.clearTimeout(m15NameHintTimerRef.current);
      m15NameHintTimerRef.current = null;
    }
    if (nameApplyTimerRef.current !== null) {
      window.clearTimeout(nameApplyTimerRef.current);
    }

    setNameApplyState("loading");
    setM15NameHint("正在申请修改本节点名称…");

    nameApplyTimerRef.current = window.setTimeout(() => {
      setUsername(nextName);
      setM15NameHint("修改成功");
      setNameApplyState("idle");
      nameApplyTimerRef.current = null;

      m15NameHintTimerRef.current = window.setTimeout(() => {
        setM15NameHint("");
      }, 1800);
    }, NAME_APPLY_SIMULATION_MS);
  }, [draftUsername, nameApplyState, setUsername, username, pushM15NameHint]);

  const handleApplyCenterNode = useCallback(() => {
    if (applyState === "loading") return;

    // Revert to normal node (center -> normal)
    if (isSelfCenterNode) {
      setApplyState("loading");
      if (applyTimerRef.current !== null) {
        window.clearTimeout(applyTimerRef.current);
      }

      applyTimerRef.current = window.setTimeout(() => {
        setIsSelfCenterNode(false);
        setApplyState("success");
      }, 3000); // 3 seconds delay
      return;
    }

    // Apply for center node (normal -> center)
    setApplyState("loading");
    if (applyTimerRef.current !== null) {
      window.clearTimeout(applyTimerRef.current);
    }

    applyTimerRef.current = window.setTimeout(() => {
      const success = judgeModelConfigured;
      setApplyState(success ? "success" : "failed");
      if (success) {
        setIsSelfCenterNode(true);
      }
    }, APPLY_SIMULATION_MS);
  }, [applyState, isSelfCenterNode, judgeModelConfigured, setIsSelfCenterNode]);

  const handleMapClick = useCallback(
    (event: MouseEvent<SVGSVGElement>) => {
      if (!mapDefinition || !desktopMapDefinition || !hitTesterRef.current) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * mapDefinition.viewBoxWidth;
      const y = ((event.clientY - rect.top) / rect.height) * mapDefinition.viewBoxHeight;

      const hitRegion = hitTesterRef.current(x, y);
      if (!hitRegion) {
        pushM3Hint("无法在此处设置节点");
        return;
      }

      const location = buildLocationFromPoint(x, y, hitRegion.plateId);
      if (!location) {
        pushM3Hint("位置映射失败，请重试");
        return;
      }

      updatePreviewLocationWithFade(location);
    },
    [buildLocationFromPoint, desktopMapDefinition, mapDefinition, pushM3Hint, updatePreviewLocationWithFade],
  );

  const handleSaveLocation = useCallback(async () => {
    if (!previewLocation) {
      pushM3Hint("请先在合法区域内选择位置");
      return;
    }

    const fromPlate = savedNodeLocation?.plateId;
    const toPlate = previewLocation.plateId;
    const plateChanged = fromPlate !== undefined && fromPlate !== toPlate;

    if (plateChanged) {
      const fromLabel = getM3PlateLabel(fromPlate!);
      const toLabel = getM3PlateLabel(toPlate);
      const remark = `${fromLabel}变更到${toLabel}`;
      setLocationApplyBusy(true);
      try {
        await adminSubmitRequest(username, "更改节点位置", remark);
        pushM3Hint("申请已提交，等待管理员审核", 4500);
      } finally {
        setLocationApplyBusy(false);
      }
      return;
    }

    const committed = {
      ...previewLocation,
      savedAt: Date.now(),
    };
    setSavedNodeLocation(committed);
    setPreviewLocation(committed);
    previewLocationRef.current = committed;
    setFadingLocation(null);
    pushM3Hint("位置已保存");
  }, [previewLocation, savedNodeLocation, username, pushM3Hint, setSavedNodeLocation]);

  useEffect(() => {
    setPreviewLocation(savedNodeLocation);
    previewLocationRef.current = savedNodeLocation;
    setFadingLocation(null);
    setApplyState("idle");
    setNameApplyState("idle");
    setM1AvatarHint("");
    setM15NameHint("");
    setM3Hint("");
    if (nameApplyTimerRef.current !== null) {
      window.clearTimeout(nameApplyTimerRef.current);
      nameApplyTimerRef.current = null;
    }
    resetAvatarDraft();
  }, [resetAvatarDraft, savedNodeLocation]);

  useEffect(() => {
    setDraftUsername(username);
  }, [username]);

  useEffect(() => {
    if (!previewLocation) return;
    const normalized = normalizeLocationToCurrentMap(previewLocation);
    if (!normalized) return;

    const needsUpdate =
      normalized.mapViewBoxWidth !== previewLocation.mapViewBoxWidth ||
      normalized.mapViewBoxHeight !== previewLocation.mapViewBoxHeight ||
      normalized.mapX !== previewLocation.mapX ||
      normalized.mapY !== previewLocation.mapY;

    if (needsUpdate) {
      setPreviewLocation(normalized);
      previewLocationRef.current = normalized;
    }
  }, [normalizeLocationToCurrentMap, previewLocation]);

  useEffect(() => {
    let active = true;

    Promise.all([fetch(NEW_SVG_URL), fetch(DESKTOP_SVG_URL)])
      .then(async ([newResp, desktopResp]) => {
        if (!newResp.ok || !desktopResp.ok) {
          throw new Error("svg fetch failed");
        }
        const [newMarkup, desktopMarkup] = await Promise.all([newResp.text(), desktopResp.text()]);
        if (!active) return;

        const nextMap = buildPlateMapFromSvgMarkup(newMarkup);
        const nextDesktop = buildPlateMapFromSvgMarkup(desktopMarkup);
        setMapDefinition(nextMap);
        setDesktopMapDefinition(nextDesktop);
        hitTesterRef.current = createPlateHitTester(nextMap);
      })
      .catch(() => {
        if (!active) return;
        setMapDefinition(null);
        setDesktopMapDefinition(null);
        hitTesterRef.current = null;
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!mapDefinition || !desktopMapDefinition) return;
    if (previewLocation) return;

    const fallbackRegion = mapDefinition.regions.find((region) => region.plateId === "plate-4") ?? mapDefinition.regions[0];
    if (!fallbackRegion) return;

    const fallback = buildLocationFromPoint(fallbackRegion.centroidX, fallbackRegion.centroidY, fallbackRegion.plateId);
    if (!fallback) return;

    setPreviewLocation(fallback);
    previewLocationRef.current = fallback;
  }, [buildLocationFromPoint, desktopMapDefinition, mapDefinition, previewLocation]);

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (applyTimerRef.current !== null) {
        window.clearTimeout(applyTimerRef.current);
      }
      if (m1AvatarHintTimerRef.current !== null) {
        window.clearTimeout(m1AvatarHintTimerRef.current);
      }
      if (m15NameHintTimerRef.current !== null) {
        window.clearTimeout(m15NameHintTimerRef.current);
      }
      if (m3HintTimerRef.current !== null) {
        window.clearTimeout(m3HintTimerRef.current);
      }
      if (avatarSuccessTimerRef.current !== null) {
        window.clearTimeout(avatarSuccessTimerRef.current);
      }
      if (mapCursorFadeTimerRef.current !== null) {
        window.clearTimeout(mapCursorFadeTimerRef.current);
      }
      if (nameApplyTimerRef.current !== null) {
        window.clearTimeout(nameApplyTimerRef.current);
      }
    };
  }, []);

  return (
    <section className="global-top-nav__profile-modal global-top-nav__profile-modal--long" role="dialog" aria-modal="true" aria-label="个人信息设置">
      <div className="global-top-nav__profile-content global-top-nav__profile-content--long">
        <header className="global-top-nav__profile-modal-title-wrap">
          <h2 className="global-top-nav__profile-modal-title">节点信息设置</h2>
        </header>

        <section className="global-top-nav__section">
          <h3 className="global-top-nav__panel-title">更改头像</h3>

          <div className="global-top-nav__m1-grid">
            <div className="global-top-nav__m1-left">
              <input
                ref={avatarUploadInputRef}
                id="profile-avatar-upload"
                className="global-top-nav__avatar-upload-input"
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
              />
              <button
                type="button"
                className="global-top-nav__save-btn global-top-nav__avatar-upload-trigger"
                onClick={() => avatarUploadInputRef.current?.click()}
              >
                上传图片
              </button>

              {draftAvatarSrc && (
                <>
                  <div className="global-top-nav__avatar-crop-frame">
                    <div className="global-top-nav__avatar-cropper-stage">
                      <Cropper
                        image={draftAvatarSrc}
                        crop={avatarCrop}
                        zoom={avatarZoom}
                        aspect={1}
                        minZoom={1}
                        maxZoom={3.2}
                        restrictPosition={true}
                        showGrid={false}
                        zoomWithScroll={true}
                        onCropChange={setAvatarCrop}
                        onZoomChange={setAvatarZoom}
                        onCropComplete={handleAvatarCropComplete}
                      />
                    </div>
                  </div>

                  <p className="global-top-nav__avatar-crop-guide">使用滚轮或拖拽调整尺寸</p>
                </>
              )}
            </div>

            <div className="global-top-nav__m1-right">
              <p className="global-top-nav__field-label">头像预览</p>
              <div className="global-top-nav__avatar-round-preview">
                {draftAvatarPreviewUrl ? (
                  <img src={draftAvatarPreviewUrl} className="global-top-nav__avatar-preview-image" alt="圆形头像预览" />
                ) : !draftAvatarSrc && avatarDataUrl ? (
                  <img src={avatarDataUrl} className="global-top-nav__avatar-preview-image" alt="当前头像预览" />
                ) : draftAvatarSrc ? (
                  <span className="global-top-nav__avatar-crop-placeholder">拖拽或缩放后生成预览</span>
                ) : (
                  <span className="global-top-nav__avatar-crop-placeholder">当前未设置头像</span>
                )}
              </div>

              {draftAvatarSrc && (
                <div className="global-top-nav__inline-actions">
                  <button type="button" className="global-top-nav__save-btn" onClick={handleApplyAvatar} disabled={avatarBusy}>
                    {avatarBusy ? "处理中…" : "保存头像"}
                  </button>
                  <button type="button" className="global-top-nav__ghost-btn" onClick={handleResetAvatarCrop}>
                    重置裁剪
                  </button>
                </div>
              )}
            </div>
          </div>

          <span className="global-top-nav__save-hint" aria-live="polite">{m1AvatarHint}</span>
        </section>

        <section className="global-top-nav__section">
          <h3 className="global-top-nav__panel-title">节点名称</h3>

          <label className="global-top-nav__field-label" htmlFor="display-name-input">
            节点名称
          </label>
          <input
            id="display-name-input"
            className="global-top-nav__field-input"
            value={draftUsername}
            onChange={(e) => setDraftUsername(e.target.value)}
          />
          <button
            type="button"
            className="global-top-nav__save-btn global-top-nav__name-save-btn"
            onClick={handleSaveUsername}
            disabled={nameApplyState === "loading"}
          >
            {nameApplyState === "loading" ? "申请中…" : "申请更改"}
          </button>
          <span className="global-top-nav__save-hint" aria-live="polite">{m15NameHint}</span>
        </section>

        <section className="global-top-nav__section">
          <h3 className="global-top-nav__panel-title">申请权限</h3>
          <p className="global-top-nav__panel-subtitle">
            当前法官模型状态：
            <strong className={judgeModelConfigured ? "global-top-nav__status-ok" : "global-top-nav__status-bad"}>
              {judgeModelConfigured ? "已配置" : "未配置"}
            </strong>
          </p>

          {isSelfCenterNode ? (
            <button
              type="button"
              className={`global-top-nav__long-apply-btn global-top-nav__long-apply-btn--danger${applyState === "loading" ? " is-loading" : ""}`}
              onClick={handleApplyCenterNode}
              disabled={applyState === "loading"}
            >
              {applyState === "loading" ? "恢复中，请稍候…" : "恢复普通节点"}
            </button>
          ) : (
            <button
              type="button"
              className={`global-top-nav__long-apply-btn${applyState === "loading" ? " is-loading" : ""}`}
              onClick={handleApplyCenterNode}
              disabled={applyState === "loading"}
            >
              {applyState === "loading" ? "申请中，请稍候…" : "申请中心节点"}
            </button>
          )}

          <span
            className={`global-top-nav__save-hint${applyState === "failed" || (applyState === "success" && isSelfCenterNode === false) ? " global-top-nav__save-hint--warning" : ""}`}
            aria-live="polite"
          >
            {applyMessage}
          </span>
        </section>

        <section className="global-top-nav__section">
          <h3 className="global-top-nav__panel-title">节点位置</h3>
          <p className="global-top-nav__panel-subtitle">请在地图区域内选取位置，点击保存后生效</p>

          <div className="global-top-nav__m3-layout">
            <div className="global-top-nav__map-shell">
              {mapDefinition ? (
                <svg
                  className="global-top-nav__location-map"
                  viewBox={`0 0 ${mapDefinition.viewBoxWidth} ${mapDefinition.viewBoxHeight}`}
                  onClick={handleMapClick}
                  role="img"
                  aria-label="节点位置选择地图（背景图）"
                >
                  <image
                    href={LOCATION_MAP_BACKGROUND_URL}
                    x={`${m3MapBgXPercent}%`}
                    y={`${m3MapBgYPercent}%`}
                    width={`${M3_MAP_BG_SCALE * 90}%`}
                    height={`${M3_MAP_BG_SCALE * 100}%`}
                    preserveAspectRatio="none"
                    className="global-top-nav__location-map-bg-image"
                    aria-hidden="true"
                  />

                  {fadingLocation &&
                    previewLocation &&
                    (fadingLocation.mapX !== previewLocation.mapX || fadingLocation.mapY !== previewLocation.mapY) && (
                      <g
                        key={`location-cursor-leaving-${fadingLocation.savedAt}-${previewLocation.savedAt}`}
                        transform={`translate(${fadingLocation.mapX} ${fadingLocation.mapY})`}
                        className="global-top-nav__location-cursor global-top-nav__location-cursor--leaving"
                      >
                        <MapLocationCursorGlyph isCenter={isSelfCenterNode} />
                      </g>
                    )}

                  {previewLocation && (
                    <g
                      key={`location-cursor-active-${previewLocation.savedAt}`}
                      transform={`translate(${previewLocation.mapX} ${previewLocation.mapY})`}
                      className="global-top-nav__location-cursor global-top-nav__location-cursor--active"
                    >
                      <MapLocationCursorGlyph isCenter={isSelfCenterNode} />
                    </g>
                  )}
                </svg>
              ) : (
                <div className="global-top-nav__location-map-loading">地图加载中…</div>
              )}
            </div>

            <div className="global-top-nav__m3-footer">
              <span className="global-top-nav__save-hint global-top-nav__m3-feedback-hint" aria-live="polite">{m3Hint}</span>
              <div className="global-top-nav__m3-action-block">
                <p className="global-top-nav__m3-lock-hint">
                  {previewLocation ? `当前定位：${getM3PlateLabel(previewLocation.plateId)}` : "当前定位：未选择"}
                </p>
                <button type="button" className="global-top-nav__save-btn global-top-nav__m3-save-btn" onClick={() => void handleSaveLocation()} disabled={locationApplyBusy}>
                  {locationApplyBusy ? "申请中…" : "保存位置"}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
