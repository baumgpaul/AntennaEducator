/**
 * PNG capture of a 3D view with its HTML overlays (colour scales).
 *
 * The WebGL canvas only holds the scene; colour bars are DOM elements on top of it,
 * so a plain `canvas.toDataURL()` loses them. We rasterise each overlay with
 * html2canvas and draw it onto a copy of the scene at the same on-screen position.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where an overlay lands in canvas pixels. The canvas backing store is usually
 * larger than its CSS box (devicePixelRatio), so CSS offsets are scaled.
 */
export function overlayPlacement(
  canvasRect: Rect,
  canvasPixelWidth: number,
  canvasPixelHeight: number,
  overlayRect: Rect,
): { x: number; y: number; width: number; height: number; scale: number } {
  const sx = canvasRect.width > 0 ? canvasPixelWidth / canvasRect.width : 1;
  const sy = canvasRect.height > 0 ? canvasPixelHeight / canvasRect.height : sx;
  return {
    x: (overlayRect.left - canvasRect.left) * sx,
    y: (overlayRect.top - canvasRect.top) * sy,
    width: overlayRect.width * sx,
    height: overlayRect.height * sy,
    scale: sx,
  };
}

type Rasterise = (el: HTMLElement, scale: number) => Promise<HTMLCanvasElement>;

/**
 * Data URL of `sceneUrl` (the WebGL canvas image) with every `overlays` element
 * drawn on top. Overlays that fail to rasterise are skipped, never fatal: the scene
 * alone is still a useful image.
 */
export async function compositeSceneWithOverlays(
  sceneUrl: string,
  canvas: HTMLCanvasElement,
  overlays: HTMLElement[],
  rasterise: Rasterise,
): Promise<string> {
  if (overlays.length === 0) return sceneUrl;
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  if (!ctx) return sceneUrl;

  const scene = await loadImage(sceneUrl);
  ctx.drawImage(scene, 0, 0, out.width, out.height);

  const canvasRect = canvas.getBoundingClientRect();
  for (const el of overlays) {
    const p = overlayPlacement(canvasRect, canvas.width, canvas.height, el.getBoundingClientRect());
    if (p.width <= 0 || p.height <= 0) continue;
    try {
      const img = await rasterise(el, p.scale);
      ctx.drawImage(img, p.x, p.y, p.width, p.height);
    } catch {
      // keep the scene without this overlay
    }
  }
  return out.toDataURL('image/png');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the 3D view image'));
    img.src = src;
  });
}
