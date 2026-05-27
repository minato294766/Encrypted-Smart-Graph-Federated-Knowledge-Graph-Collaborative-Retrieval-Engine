"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type BeamsBackgroundProps = {
  beamWidth?: number;
  beamHeight?: number;
  beamNumber?: number;
  lightColor?: string;
  speed?: number;
  noiseIntensity?: number;
  scale?: number;
  rotation?: number;
};

const VERT_SHADER = `
uniform float uTime;
uniform float uSpeed;
uniform float uScale;
uniform float uNoiseIntensity;

varying vec2 vUv;
varying float vWave;

void main() {
  vUv = uv;
  vec3 p = position;

  float waveA = sin((p.y * 0.18 + p.x * 0.24) * uScale + uTime * uSpeed * 1.4);
  float waveB = cos((p.y * 0.12 - p.x * 0.16) * (uScale * 1.3) + uTime * uSpeed * 0.9);
  float combined = (waveA + waveB) * 0.5;

  p.z += combined * (0.42 * uNoiseIntensity);
  p.x += sin(p.y * 0.06 + uTime * 0.8) * 0.06;

  vWave = combined;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAG_SHADER = `
uniform vec3 uColor;
varying vec2 vUv;
varying float vWave;

void main() {
  float centerGlow = 1.0 - abs(vUv.x - 0.5) * 2.0;
  centerGlow = smoothstep(0.0, 1.0, centerGlow);

  float topFade = smoothstep(0.04, 0.3, vUv.y);
  float bottomFade = 1.0 - smoothstep(0.76, 0.98, vUv.y);
  float verticalFade = topFade * bottomFade;

  float shimmer = 0.86 + vWave * 0.18;
  float alpha = centerGlow * verticalFade * 0.36 * shimmer;

  gl_FragColor = vec4(uColor, alpha);
}
`;

function createStackedPlanesGeometry(count: number, width: number, height: number, spacing: number, ySegments = 72) {
  const geometry = new THREE.BufferGeometry();
  const verticesPerBeam = (ySegments + 1) * 2;
  const totalVertices = count * verticesPerBeam;
  const totalIndices = count * ySegments * 6;

  const positions = new Float32Array(totalVertices * 3);
  const uvs = new Float32Array(totalVertices * 2);
  const indices = new Uint32Array(totalIndices);

  const totalWidth = count * width + (count - 1) * spacing;
  const xBase = -totalWidth / 2;

  let vOffset = 0;
  let uvOffset = 0;
  let iOffset = 0;

  for (let i = 0; i < count; i += 1) {
    const x0 = xBase + i * (width + spacing);
    const x1 = x0 + width;

    for (let j = 0; j <= ySegments; j += 1) {
      const t = j / ySegments;
      const y = height * (t - 0.5);

      positions.set([x0, y, 0, x1, y, 0], vOffset * 3);
      uvs.set([0, t, 1, t], uvOffset);

      if (j < ySegments) {
        const a = vOffset;
        const b = vOffset + 1;
        const c = vOffset + 2;
        const d = vOffset + 3;
        indices.set([a, b, c, c, b, d], iOffset);
        iOffset += 6;
      }

      vOffset += 2;
      uvOffset += 4;
    }
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

export function BeamsBackground({
  beamWidth = 2.2,
  beamHeight = 17,
  beamNumber = 8,
  lightColor = "#3152f4",
  speed = 0.75,
  noiseIntensity = 0.8,
  scale = 0.18,
  rotation = 18,
}: BeamsBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xffffff, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 22);

    const geometry = createStackedPlanesGeometry(beamNumber, beamWidth, beamHeight, 0);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: speed },
        uScale: { value: scale * 10 },
        uNoiseIntensity: { value: noiseIntensity },
        uColor: { value: new THREE.Color(lightColor) },
      },
      vertexShader: VERT_SHADER,
      fragmentShader: FRAG_SHADER,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const beams = new THREE.Mesh(geometry, material);
    beams.rotation.z = THREE.MathUtils.degToRad(rotation);
    scene.add(beams);

    const resize = () => {
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const tick = () => {
      material.uniforms.uTime.value += 0.016;
      renderer.render(scene, camera);
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      resizeObserver.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [beamWidth, beamHeight, beamNumber, lightColor, speed, noiseIntensity, scale, rotation]);

  return <div ref={containerRef} className="beams-background-canvas" />;
}

