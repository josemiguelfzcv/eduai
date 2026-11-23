'use client'

import { useEffect, useRef } from 'react'

// The hero's picture, alive: a breeze moves the leaves and the clouds drift, slowly, as on a calm morning. The
// picture itself is drawn first, as an ordinary image; once the page is running, a canvas over it redraws the same
// picture with each place nudged by a motion map (red: how much it sways, green: how much it drifts). Nothing moves
// for people who prefer reduced motion or where WebGL isn't available: they keep the still picture.

/** Both the image and the canvas show the picture this much larger, so swaying leaves never pull in its edge. */
const OVERSCAN = 1.012
const FRAME_MS = 1000 / 30

const VERTEX = `
attribute vec2 corner;
varying vec2 uv;
void main() {
  uv = vec2(corner.x * 0.5 + 0.5, 0.5 - corner.y * 0.5);
  gl_Position = vec4(corner, 0.0, 1.0);
}`

const FRAGMENT = `
precision highp float;
uniform sampler2D picture;
uniform sampler2D motion;
uniform vec2 cover;
uniform vec2 pixel;
uniform float time;
uniform float ease;
varying vec2 uv;
const float TURN = 6.2831853;

void main() {
  vec2 at = (uv - 0.5) * cover + 0.5;
  vec2 move = texture2D(motion, at).rg;

  // The breeze: gusts cross the picture from the left; every branch answers in its own time.
  float gust = 0.5 + 0.3 * sin(TURN * (at.x * 0.8 - time / 9.0)) + 0.2 * sin(TURN * (at.x * 0.35 + at.y * 0.5 - time / 14.0) + 1.7);
  float branch = TURN * (at.x * 3.1 + at.y * 2.3);
  vec2 sway = vec2(
    sin(time * 1.15 + branch) + 0.45 * sin(time * 2.3 + branch * 1.7 + 0.8),
    0.4 * sin(time * 0.9 + branch * 1.3 + 2.0)
  );
  vec2 flutter = 0.22 * vec2(
    sin(time * 3.1 + at.x * 57.0 + at.y * 31.0),
    cos(time * 2.7 + at.x * 29.0 - at.y * 49.0)
  );
  vec2 leaf = at + move.r * (0.35 + 0.65 * gust) * 3.6 * (sway + flutter) * pixel * ease;

  // The sky: two copies of the clouds, each sliding to the right and fading into the other, so the drift never ends.
  float a = fract(time / 18.0);
  float b = fract(time / 18.0 + 0.5);
  float reach = move.g * 0.022 * ease;
  vec4 first = texture2D(picture, leaf - vec2(reach * (a - 0.5), 0.0));
  vec4 second = texture2D(picture, leaf - vec2(reach * (b - 0.5), 0.0));
  vec3 color = mix(first.rgb, second.rgb, abs(2.0 * a - 1.0));

  // Sunlight through moving leaves.
  color *= 1.0 + 0.03 * move.r * ease * sin(time * 1.9 + branch * 2.1);
  gl_FragColor = vec4(color, 1.0);
}`

function texture(gl: WebGLRenderingContext, unit: number, source: HTMLImageElement) {
  const made = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, made)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source)
  return made
}

function program(gl: WebGLRenderingContext) {
  const made = gl.createProgram()
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, FRAGMENT],
  ] as const) {
    const shader = gl.createShader(type)
    if (!shader) return null
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null
    gl.attachShader(made, shader)
  }
  gl.linkProgram(made)
  return gl.getProgramParameter(made, gl.LINK_STATUS) ? made : null
}

/** Starts the motion on the canvas; resolves to the function that stops it (or null if it couldn't start). */
async function animate(
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
  motionSrc: string,
  cancelled: () => boolean,
) {
  if (!image.complete) await new Promise((done) => image.addEventListener('load', done, { once: true }))
  const map = new Image()
  map.src = motionSrc
  try {
    await Promise.all([image.decode(), map.decode()])
  } catch {
    return null
  }
  if (cancelled()) return null
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' })
  const shader = gl && program(gl)
  if (!gl || !shader) return null

  gl.useProgram(shader)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const corner = gl.getAttribLocation(shader, 'corner')
  gl.enableVertexAttribArray(corner)
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0)
  texture(gl, 0, image)
  texture(gl, 1, map)
  gl.uniform1i(gl.getUniformLocation(shader, 'picture'), 0)
  gl.uniform1i(gl.getUniformLocation(shader, 'motion'), 1)
  gl.uniform2f(gl.getUniformLocation(shader, 'pixel'), 1 / image.naturalWidth, 1 / image.naturalHeight)
  const cover = gl.getUniformLocation(shader, 'cover')
  const time = gl.getUniformLocation(shader, 'time')
  const ease = gl.getUniformLocation(shader, 'ease')

  const fit = () => {
    const { clientWidth: w, clientHeight: h } = canvas
    if (!w || !h) return
    // No sharper than the picture itself: more pixels would only cost battery.
    const scale = Math.min(window.devicePixelRatio || 1, 2, (image.naturalWidth * 1.25) / w)
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    gl.viewport(0, 0, canvas.width, canvas.height)
    const frame = w / h
    const picture = image.naturalWidth / image.naturalHeight
    // The part of the picture an object-fit: cover image shows, centred.
    gl.uniform2f(
      cover,
      (frame > picture ? 1 : frame / picture) / OVERSCAN,
      (frame > picture ? picture / frame : 1) / OVERSCAN,
    )
  }
  fit()

  let request = 0
  let running = false
  let inView = true
  let clock = 0
  let last = 0
  let shown = false
  const draw = (now: number) => {
    request = requestAnimationFrame(draw)
    if (now - last < FRAME_MS - 2) return
    clock += Math.min(now - last, 100) / 1000
    last = now
    const t = Math.min(clock / 3.5, 1)
    gl.uniform1f(time, clock)
    gl.uniform1f(ease, t * t * (3 - 2 * t))
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    if (!shown) {
      shown = true
      canvas.style.opacity = '1'
    }
  }
  const sync = () => {
    const should = inView && !document.hidden
    if (should === running) return
    running = should
    if (running) {
      last = performance.now()
      request = requestAnimationFrame(draw)
    } else cancelAnimationFrame(request)
  }
  const resized = new ResizeObserver(fit)
  resized.observe(canvas)
  const seen = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting
    sync()
  })
  seen.observe(canvas)
  const lost = () => {
    canvas.style.opacity = '0'
    inView = false
    sync()
  }
  canvas.addEventListener('webglcontextlost', lost)
  document.addEventListener('visibilitychange', sync)
  sync()

  return () => {
    cancelAnimationFrame(request)
    resized.disconnect()
    seen.disconnect()
    canvas.removeEventListener('webglcontextlost', lost)
    document.removeEventListener('visibilitychange', sync)
    canvas.style.opacity = '0'
  }
}

export function HeroScene({
  src,
  motion,
  width,
  height,
}: {
  src: string
  motion: string
  width: number
  height: number
}) {
  const imageRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const image = imageRef.current
    const canvas = canvasRef.current
    if (!image || !canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let stop: (() => void) | null = null
    let gone = false
    animate(image, canvas, motion, () => gone).then((made) => {
      if (gone) made?.()
      else stop = made
    })
    return () => {
      gone = true
      stop?.()
    }
  }, [motion])

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={src}
        alt=""
        width={width}
        height={height}
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ transform: `scale(${OVERSCAN})` }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full opacity-0 transition-opacity duration-1000"
      />
    </>
  )
}
