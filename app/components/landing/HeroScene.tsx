'use client'

import { useEffect, useRef } from 'react'

// The hero's picture, alive: a breeze moves the leaves and the clouds cross the sky, plainly but gently, as on a calm
// morning. The picture itself is drawn first, as an ordinary image; once the page is running, a canvas over it redraws
// the same picture with its leaves nudged and its clouds carried along. Nothing moves for people who prefer reduced
// motion or where WebGL isn't available: they keep the still picture.
//
// Three small pictures, made from the hero's own (see the comments in the shader), say what moves:
//   motion  red: how much a place sways in the breeze (most at a branch's free end, nothing where it is held, and
//           level across each leaf so the leaf moves whole); green: how open the sky is there to passing clouds
//   clouds  the clouds on their own, as a belt as wide as the picture that goes round: the upper half is what each
//           cloud adds over an ordinary blue, the lower half how opaque it is. Besides the picture's own clouds it
//           holds more of them where no open sky shows, waiting their turn
//   sky     the sky as it would be without clouds

/** Both the image and the canvas show the picture this much larger, so swaying leaves never pull in its edge. */
const OVERSCAN = 1.02
const FRAME_MS = 1000 / 30
/** How fast the clouds cross, in the picture's own pixels a second: a cloud's width in half a minute. */
const CLOUD_SPEED = 6
/** Seconds the clouds take to get under way. */
const CLOUD_START = 1.5

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
uniform sampler2D clouds;
uniform sampler2D sky;
uniform vec2 cover;
uniform vec2 pixel;
uniform float time;
uniform float ease;
uniform float drift;
varying vec2 uv;
const float TURN = 6.2831853;
// The belt of clouds holds the sky's rows only: this much of the picture's height.
const float SKY = 576.0 / 941.0;
// The ordinary blue the belt's light is measured from.
const vec3 BLUE = vec3(176.0, 196.0, 232.0) / 255.0;

// A row of the sky in the belt's upper half (add 0.5 for the lower).
float row(float y) {
  return clamp(y / SKY, 0.001, 0.999) * 0.5;
}

void main() {
  vec2 at = (uv - 0.5) * cover + 0.5;
  vec2 move = texture2D(motion, at).rg;

  // The breeze, in the picture's own pixels. Everything here changes slowly from place to place, over hundreds of
  // pixels: a plant then moves almost as one piece and bends where the map holds it. (Motion that differs from one
  // leaf to the next squeezes and spreads the picture between them, and the leaves seem to swell and shrink like a
  // wave passing through.) Now and then a gust comes through from the left, leans the foliage downwind and sets it
  // swaying a little wider.
  vec2 spot = at / pixel;
  float gust = clamp(
    0.5 + 0.32 * sin(TURN * (spot.x / 4200.0 - time / 8.5)) +
      0.22 * sin(TURN * (spot.x / 6400.0 + spot.y / 2300.0 - time / 13.7) + 1.7),
    0.0, 1.0);
  float live = 0.55 + 0.45 * gust;
  float slow = 1.5 * time + TURN * (spot.x / 5200.0 + spot.y / 1500.0);   // to and fro, every four seconds or so
  float quick = 2.35 * time + TURN * (spot.y / 1100.0 - spot.x / 6000.0) + 1.3;
  vec2 sway = vec2(
    sin(slow) + 0.35 * sin(quick),
    0.26 * sin(1.305 * time + TURN * (spot.x / 2200.0 - spot.y / 2800.0) + 2.0) + 0.14 * sin(quick + 0.9)
  );
  // Leaves stirring where they are: small turns about fixed spots (a turn has no swelling in it), under a pixel and
  // a half, so that a plant isn't one stiff piece.
  float a = spot.x / 41.0 + 0.5;
  float b = spot.y / 37.0 + 1.2;
  float c = spot.x / 29.0 - spot.y / 53.0 + 2.0;
  float d = spot.x / 61.0 + spot.y / 31.0;
  vec2 stir =
    sin(1.9 * time + TURN * (spot.x / 900.0 - spot.y / 700.0)) * 34.0 *
      vec2(sin(a) * cos(b) / 37.0, -cos(a) * sin(b) / 41.0) +
    sin(2.7 * time + 1.0 + TURN * (spot.x / 1100.0 + spot.y / 800.0)) * 10.0 *
      vec2(sin(c) * cos(d) / 31.0 - cos(c) * sin(d) / 53.0, -cos(c) * sin(d) / 29.0 - sin(c) * cos(d) / 61.0);
  vec2 shift = vec2(8.0, 0.9) * gust * gust + live * (8.0 * sway + stir);
  vec2 leaf = at - move.r * shift * pixel * ease;

  vec3 color = texture2D(picture, leaf).rgb;

  // The clouds. Where the sky is open, the picture's own cloud is taken out (what it has over the bare sky, as far
  // as the belt says a cloud stands there) and the belt's cloud, wherever it has got to, is laid over what is left.
  // With the belt where it started the two are the same cloud, so the picture is unchanged.
  if (move.g > 0.002) {
    float along = fract(at.x - drift);
    vec3 light = texture2D(clouds, vec2(along, row(at.y))).rgb * (170.0 / 255.0) - 48.0 / 255.0;
    float thick = texture2D(clouds, vec2(along, row(at.y) + 0.5)).r;
    float stood = 0.02 + sqrt(0.0004 + 0.16 * texture2D(clouds, vec2(leaf.x, row(leaf.y) + 0.5)).r);
    vec3 own = clamp((stood - 0.04) / 0.16, 0.0, 1.0) * (color - texture2D(sky, leaf).rgb);
    color += move.g * (light + thick * (BLUE - color + own) - own);
  }

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

type Sources = { motion: string; clouds: string; sky: string }

function load(src: string) {
  const made = new Image()
  made.src = src
  return made
}

/** Starts the motion on the canvas; resolves to the function that stops it (or null if it couldn't start). */
async function animate(image: HTMLImageElement, canvas: HTMLCanvasElement, sources: Sources, cancelled: () => boolean) {
  if (!image.complete) await new Promise((done) => image.addEventListener('load', done, { once: true }))
  const map = load(sources.motion)
  const belt = load(sources.clouds)
  const bare = load(sources.sky)
  try {
    await Promise.all([image, map, belt, bare].map((each) => each.decode()))
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
  for (const [unit, [name, source]] of Object.entries({
    picture: image,
    motion: map,
    clouds: belt,
    sky: bare,
  }).entries()) {
    texture(gl, unit, source)
    gl.uniform1i(gl.getUniformLocation(shader, name), unit)
  }
  gl.uniform2f(gl.getUniformLocation(shader, 'pixel'), 1 / image.naturalWidth, 1 / image.naturalHeight)
  const cover = gl.getUniformLocation(shader, 'cover')
  const time = gl.getUniformLocation(shader, 'time')
  const ease = gl.getUniformLocation(shader, 'ease')
  const drift = gl.getUniformLocation(shader, 'drift')

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
    const t = Math.min(clock / 2.5, 1)
    gl.uniform1f(time, clock)
    gl.uniform1f(ease, t * t * (3 - 2 * t))
    // How far round the belt has gone, as a part of the picture's width.
    const travelled = CLOUD_SPEED * (clock - CLOUD_START * (1 - Math.exp(-clock / CLOUD_START)))
    gl.uniform1f(drift, (travelled / image.naturalWidth) % 1)
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
  clouds,
  sky,
  width,
  height,
}: Sources & {
  src: string
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
    animate(image, canvas, { motion, clouds, sky }, () => gone).then((made) => {
      if (gone) made?.()
      else stop = made
    })
    return () => {
      gone = true
      stop?.()
    }
  }, [motion, clouds, sky])

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
