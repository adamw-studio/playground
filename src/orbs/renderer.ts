import { MAX_ORBS, MAX_STOPS } from './params';
import { FRAGMENT, VERTEX } from './shader';

/** Everything the shader needs for one frame, already eased and laid out. */
export interface OrbFrame {
  orbsA: Float32Array; // MAX_ORBS × vec4
  orbsB: Float32Array; // MAX_ORBS × vec4
  count: number;
  palette: Float32Array; // MAX_STOPS × vec3 (OKLab)
  stops: number;
  edge: number;
  distortion: number;
  blend: number;
  contrast: number;
  saturation: number;
  brightness: number;
  hueShift: number;
  grain: number;
  grainScale: number;
  frequency: number;
  complexity: number;
  warp: number;
  softness: number;
  dither: number;
  lightX: number;
  lightY: number;
  lightIntensity: number;
  shadowSoftness: number;
  shading: number;
  depth: number;
  phase: number;
  flow: number;
  turbulence: number;
  morph: number;
  fieldX: number;
  fieldY: number;
  pointer: [number, number, number];
  pointerVel: [number, number];
  imageMode: number;
  imageInfluence: number;
  seed: number;
  // liquid material
  material: number;
  glass: [number, number, number, number];
  glass2: [number, number, number, number];
  liquid: [number, number, number, number];
  liquidAbsorb: number;
  slosh: [number, number, number, number];
  shape: [number, number, number, number];
  deform: [number, number, number, number];
  lightFx: [number, number, number, number];
  lightFx2: [number, number];
  env: [number, number, number, number];
  envImage: number;
  colors: Float32Array; // 6 × vec3, linear
}

/** Reference width the grain size is expressed against, so exports keep the same texture. */
const GRAIN_REFERENCE = 900;

/** A WebGL2 program bound to one canvas. The live view and each export own one. */
export class OrbRenderer {
  readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private texture: WebGLTexture;
  private loc = new Map<string, WebGLUniformLocation | null>();
  private imageAspect = 1;
  private hasImage = false;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, preserve = false) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      preserveDrawingBuffer: preserve,
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.program = link(gl, VERTEX, FRAGMENT);
    this.vao = gl.createVertexArray()!;
    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
  }

  setImage(image: TexImageSource & { width: number; height: number }) {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    // Mipmaps let a rough liquid surface blur the image backdrop cheaply.
    gl.generateMipmap(gl.TEXTURE_2D);
    this.imageAspect = image.width / image.height;
    this.hasImage = true;
  }

  private u(name: string) {
    if (!this.loc.has(name)) this.loc.set(name, this.gl.getUniformLocation(this.program, name));
    return this.loc.get(name)!;
  }

  render(f: OrbFrame, width: number, height: number, background: [number, number, number] | null) {
    const { gl } = this;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    const side = Math.min(width, height);
    // Cover-fit: frame units → image uv.
    const frameAspect = width / height;
    const sx = this.imageAspect > frameAspect ? frameAspect / this.imageAspect : 1;
    const sy = this.imageAspect > frameAspect ? 1 : this.imageAspect / frameAspect;

    gl.uniform2f(this.u('uRes'), width, height);
    gl.uniform1f(this.u('uPx'), width / GRAIN_REFERENCE);
    gl.uniform4fv(this.u('uOrbA'), f.orbsA);
    gl.uniform4fv(this.u('uOrbB'), f.orbsB);
    gl.uniform1i(this.u('uOrbCount'), Math.min(MAX_ORBS, f.count));
    gl.uniform3fv(this.u('uPalette'), f.palette);
    gl.uniform1i(this.u('uStops'), Math.min(MAX_STOPS, Math.max(2, f.stops)));
    gl.uniform1f(this.u('uEdge'), f.edge);
    gl.uniform1f(this.u('uDistort'), f.distortion);
    gl.uniform1f(this.u('uBlend'), f.blend);
    gl.uniform1f(this.u('uContrast'), f.contrast);
    gl.uniform1f(this.u('uSat'), f.saturation);
    gl.uniform1f(this.u('uBright'), f.brightness);
    gl.uniform1f(this.u('uHue'), f.hueShift);
    gl.uniform1f(this.u('uGrain'), f.grain);
    gl.uniform1f(this.u('uGrainScale'), f.grainScale);
    gl.uniform1f(this.u('uFreq'), f.frequency);
    gl.uniform1f(this.u('uOctaves'), f.complexity);
    gl.uniform1f(this.u('uWarp'), f.warp);
    gl.uniform1f(this.u('uSoft'), f.softness);
    gl.uniform1f(this.u('uDither'), f.dither);
    gl.uniform2f(this.u('uLight'), f.lightX, f.lightY);
    gl.uniform1f(this.u('uLightI'), f.lightIntensity);
    gl.uniform1f(this.u('uShadowSoft'), f.shadowSoftness);
    gl.uniform1f(this.u('uShading'), f.shading);
    gl.uniform1f(this.u('uDepth'), f.depth);
    const a = f.phase * Math.PI * 2;
    gl.uniform2f(this.u('uLoop'), Math.cos(a), Math.sin(a));
    const fl = (f.flow * Math.PI) / 180;
    gl.uniform2f(this.u('uFlow'), Math.cos(fl), Math.sin(fl));
    gl.uniform1f(this.u('uTurb'), f.turbulence);
    gl.uniform1f(this.u('uMorph'), f.morph);
    gl.uniform2f(this.u('uField'), f.fieldX, f.fieldY);
    gl.uniform3f(this.u('uPtr'), ...f.pointer);
    gl.uniform2f(this.u('uPtrVel'), ...f.pointerVel);
    gl.uniform1i(this.u('uImage'), 0);
    gl.uniform1i(this.u('uImageMode'), this.hasImage ? f.imageMode : 0);
    gl.uniform1f(this.u('uImageAmt'), f.imageInfluence);
    gl.uniform2f(this.u('uImageScale'), (sx * width) / side, (sy * height) / side);
    gl.uniform3f(this.u('uBg'), ...(background ?? [0, 0, 0]));
    gl.uniform1f(this.u('uBgAlpha'), background ? 1 : 0);
    gl.uniform1f(this.u('uSeed'), f.seed);
    gl.uniform1i(this.u('uMaterial'), f.material);
    gl.uniform4f(this.u('uGlass'), ...f.glass);
    gl.uniform4f(this.u('uGlass2'), ...f.glass2);
    gl.uniform4f(this.u('uLiquid'), ...f.liquid);
    gl.uniform1f(this.u('uLiquidAbsorb'), f.liquidAbsorb);
    gl.uniform4f(this.u('uSlosh'), ...f.slosh);
    gl.uniform4f(this.u('uShape'), ...f.shape);
    gl.uniform4f(this.u('uDeform'), ...f.deform);
    gl.uniform4f(this.u('uLightFx'), ...f.lightFx);
    gl.uniform2f(this.u('uLightFx2'), ...f.lightFx2);
    gl.uniform4f(this.u('uEnv'), ...f.env);
    gl.uniform1i(this.u('uEnvImage'), this.hasImage ? f.envImage : 0);
    gl.uniform3fv(this.u('uColors'), f.colors);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Frees GPU objects. `release` also gives up the context — only for throwaway export
   * canvases: a live canvas hands the same context back to whoever asks for it next.
   */
  dispose(release = false) {
    const { gl } = this;
    gl.deleteProgram(this.program);
    gl.deleteTexture(this.texture);
    gl.deleteVertexArray(this.vao);
    if (release) gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader compile failed');
  return s;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'program link failed');
  return p;
}
