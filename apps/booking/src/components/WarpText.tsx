"use client";

import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Texture, Triangle } from "ogl";
import "./WarpText.css";

const vertex = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

// Adapted from React Bits WarpText. The texture is sized to the existing word,
// so the heading's native font, spacing, line breaks, and punctuation stay intact.
const fragment = `#version 300 es
precision highp float;
uniform sampler2D uTextTexture;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uPointerActive;
uniform float uTime;
uniform float uWarpStrength;
uniform float uWarpScale;
uniform float uSpeed;
uniform float uPointerInfluence;
uniform float uPointerStrength;
uniform float uRefraction;
uniform float uRipple;
in vec2 vUv;
out vec4 fragColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p *= 2.02;
    amplitude *= 0.5;
  }
  return value;
}
vec4 sampleText(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture(uTextTexture, uv);
}
void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  float time = uTime * uSpeed;
  float scale = max(uWarpScale, 0.001);
  vec2 drift = vec2(time * 0.055, -time * 0.045);
  float n1 = fbm(uv * scale * 3.1 + drift);
  float n2 = fbm((uv + 19.17) * scale * 3.4 - drift.yx);
  vec2 ambient = (vec2(n1, n2) - 0.5) * uWarpStrength * 0.045;

  vec2 pointerDelta = uv - uPointer;
  vec2 aspectDelta = vec2(pointerDelta.x * aspect, pointerDelta.y);
  float dist = length(aspectDelta);
  float radius = max(uPointerInfluence, 0.001);
  float t = clamp(dist / radius, 0.0, 1.0);
  float lens = smoothstep(radius, 0.0, dist) * uPointerActive;
  float bulge = t * (1.0 - t) * (1.0 - t) * 6.75 * uPointerActive;
  vec2 dir = dist > 0.0001 ? vec2(aspectDelta.x / aspect, aspectDelta.y) / dist : vec2(0.0);
  float rippleWave = sin(dist * 28.0 - time * 4.2) * 0.5 + 0.5;
  vec2 pointerWarp = -dir * bulge * uPointerStrength * 0.045;
  pointerWarp += dir * (rippleWave - 0.5) * uRipple * bulge * uPointerStrength * 0.016;

  vec2 displaced = uv + ambient + pointerWarp;
  vec2 splitDir = ambient + pointerWarp;
  float splitLen = length(splitDir);
  splitDir = splitLen > 0.00001 ? splitDir / splitLen : vec2(0.7071, 0.7071);
  vec2 split = splitDir * uRefraction * 0.16 * (0.35 + lens * 1.65);
  vec4 base = sampleText(displaced);
  float r = sampleText(displaced + split).r;
  float b = sampleText(displaced - split).b;
  float a = max(max(sampleText(displaced + split).a, base.a), sampleText(displaced - split).a);
  fragColor = vec4(vec3(r, base.g, b) + lens * base.a * 0.055, a);
}`;

type WarpTextProps = {
  text: string;
  warpStrength?: number;
  warpScale?: number;
  speed?: number;
  pointerInfluence?: number;
  pointerStrength?: number;
  refraction?: number;
  ripple?: boolean;
};

export function WarpText({
  text,
  warpStrength = 0.045,
  warpScale = 1.6,
  speed = 0.45,
  pointerInfluence = 0.95,
  pointerStrength = 0.42,
  refraction = 0,
  ripple = false,
}: WarpTextProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const baselineRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const baselineMarker = baselineRef.current;
    if (!root || !baselineMarker) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    root.dataset.reducedMotion = String(motionQuery.matches);

    let renderer: Renderer;
    try {
      renderer = new Renderer({ webgl: 2, alpha: true, premultipliedAlpha: false, antialias: true, dpr: Math.min(devicePixelRatio || 1, 2) });
    } catch {
      return; // The native word remains visible when WebGL is unavailable.
    }

    const gl = renderer.gl;
    const canvas = gl.canvas;
    canvas.setAttribute("aria-hidden", "true");
    root.appendChild(canvas);
    gl.clearColor(0, 0, 0, 0);

    const texture = new Texture(gl, { generateMipmaps: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR, wrapS: gl.CLAMP_TO_EDGE, wrapT: gl.CLAMP_TO_EDGE });
    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex,
      fragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTextTexture: { value: texture },
        uResolution: { value: new Float32Array([1, 1]) },
        uPointer: { value: new Float32Array([-0.1, 0.5]) },
        uPointerActive: { value: 0 },
        uTime: { value: 0 },
        uWarpStrength: { value: warpStrength },
        uWarpScale: { value: warpScale },
        uSpeed: { value: speed },
        uPointerInfluence: { value: pointerInfluence },
        uPointerStrength: { value: pointerStrength },
        uRefraction: { value: refraction },
        uRipple: { value: ripple ? 1 : 0 },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });
    let frame = 0;
    let disposed = false;
    let contextLost = false;
    let visible = true;
    let rasterVersion = 0;
    const pointer = { x: -0.1, y: 0.5, tx: 0.5, ty: 0.5, active: 0, target: 0 };
    const startTime = performance.now();
    const introDurationMs = 1250;
    let introElapsedMs = 0;
    let lastFrameAt = 0;
    let introFinished = false;

    const render = () => {
      if (!disposed && !contextLost) renderer.render({ scene: mesh });
    };
    const rasterize = async () => {
      const version = ++rasterVersion;
      try { await document.fonts.ready; } catch { /* Keep the fallback if fonts fail. */ }
      if (disposed || contextLost || version !== rasterVersion) return;

      const rect = root.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const style = getComputedStyle(root);
      const fontSize = parseFloat(style.fontSize);
      const pad = Math.max(3, fontSize * 0.045);
      const width = rect.width + pad * 2;
      const height = rect.height + pad * 2;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const textCanvas = document.createElement("canvas");
      textCanvas.width = Math.ceil(width * dpr);
      textCanvas.height = Math.ceil(height * dpr);
      const ctx = textCanvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      ctx.letterSpacing = style.letterSpacing;
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = style.color;
      ctx.fillText(text.toUpperCase(), pad, baselineMarker.getBoundingClientRect().top - rect.top + pad);

      canvas.style.left = `${-pad}px`;
      canvas.style.top = `${-pad}px`;
      renderer.dpr = dpr;
      renderer.setSize(width, height);
      program.uniforms.uResolution.value[0] = gl.drawingBufferWidth;
      program.uniforms.uResolution.value[1] = gl.drawingBufferHeight;
      texture.image = textCanvas;
      texture.needsUpdate = true;
      render();
      root.dataset.warpReady = "true";
      start();
    };

    const loop = (now: number) => {
      frame = 0;
      if (disposed || contextLost || !visible || document.hidden || motionQuery.matches) return;
      if (root.dataset.warpReady !== "true") {
        frame = requestAnimationFrame(loop);
        return;
      }

      if (!introFinished) {
        introElapsedMs += lastFrameAt ? Math.min(now - lastFrameAt, 64) : 0;
        if (introElapsedMs >= introDurationMs) introFinished = true;
      }
      lastFrameAt = now;

      if (introFinished && pointer.target === 0 && pointer.active < 0.008) {
        delete root.dataset.warpActive;
        return;
      }

      if (pointer.target > 0 || introFinished) {
        pointer.x += (pointer.tx - pointer.x) * 0.12;
        pointer.y += (pointer.ty - pointer.y) * 0.12;
        pointer.active += (pointer.target - pointer.active) * 0.1;
      } else {
        // One quick sweep from left to right, then reveal the untouched native word.
        const progress = introElapsedMs / introDurationMs;
        const travel = (1 - Math.cos(Math.PI * progress)) / 2;
        pointer.x = -0.1 + travel * 1.2;
        pointer.y = 0.5 + Math.sin(progress * Math.PI * 2) * 0.1;
        pointer.active = Math.min(1, progress * 6, (1 - progress) * 6) * 0.9;
      }

      program.uniforms.uPointer.value[0] = pointer.x;
      program.uniforms.uPointer.value[1] = pointer.y;
      program.uniforms.uPointerActive.value = pointer.active;
      program.uniforms.uWarpStrength.value = warpStrength * pointer.active;
      program.uniforms.uTime.value = (now - startTime) * 0.001;
      render();
      root.dataset.warpActive = "true";
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!frame && !disposed && !contextLost && visible && !document.hidden && !motionQuery.matches && (!introFinished || pointer.target > 0 || pointer.active >= 0.008)) frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      lastFrameAt = 0;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const wordRect = root.getBoundingClientRect();
      const reach = Math.max(60, parseFloat(getComputedStyle(root).fontSize) * 0.9);
      const dx = Math.max(wordRect.left - event.clientX, 0, event.clientX - wordRect.right);
      const dy = Math.max(wordRect.top - event.clientY, 0, event.clientY - wordRect.bottom);
      const distance = Math.min(1, Math.hypot(dx, dy) / reach);
      pointer.target = 1 - distance * distance * (3 - 2 * distance);

      const canvasRect = canvas.getBoundingClientRect();
      pointer.tx = (event.clientX - canvasRect.left) / canvasRect.width;
      pointer.ty = 1 - (event.clientY - canvasRect.top) / canvasRect.height;
      if (introFinished && pointer.active < 0.008) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
      }
      start();
    };
    const onPointerLeave = () => {
      pointer.target = 0;
      start();
    };
    const onMotionChange = () => {
      root.dataset.reducedMotion = String(motionQuery.matches);
      if (motionQuery.matches) stop(); else start();
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      stop();
      delete root.dataset.warpReady;
      delete root.dataset.warpActive;
    };
    const onVisibility = () => {
      if (document.hidden) stop(); else start();
    };
    const resizeObserver = new ResizeObserver(() => { void rasterize(); });
    resizeObserver.observe(root);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start(); else stop();
    });
    intersectionObserver.observe(root);
    window.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("blur", onPointerLeave);
    canvas.addEventListener("webglcontextlost", onContextLost);
    motionQuery.addEventListener("change", onMotionChange);
    document.addEventListener("visibilitychange", onVisibility);
    void rasterize();
    start();

    return () => {
      disposed = true;
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("blur", onPointerLeave);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      motionQuery.removeEventListener("change", onMotionChange);
      document.removeEventListener("visibilitychange", onVisibility);
      delete root.dataset.warpReady;
      delete root.dataset.warpActive;
      if (!contextLost) {
        if (texture.texture) gl.deleteTexture(texture.texture);
        geometry.remove();
        program.remove();
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      canvas.remove();
    };
  }, [text, warpStrength, warpScale, speed, pointerInfluence, pointerStrength, refraction, ripple]);

  return <span className="warp-text" ref={rootRef}><span className="warp-text__label">{text}</span><span className="warp-text__baseline" ref={baselineRef} aria-hidden="true" /></span>;
}
