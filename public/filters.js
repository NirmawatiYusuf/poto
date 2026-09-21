/**
 * filters.js — SnapBooth Studio Filter Engine
 * 23 Real-Time Canvas Filters with High-Contrast Visual Swatches
 */

const Filters = (() => {

  // ─── Helpers ───
  function clamp(val) {
    return val < 0 ? 0 : val > 255 ? 255 : val;
  }

  // Shared reusable buffer to eliminate per-frame Garbage Collection (GC) pauses
  let _sharedCopy = null;
  function getSharedCopy(data) {
    if (!_sharedCopy || _sharedCopy.length !== data.length) {
      _sharedCopy = new Uint8ClampedArray(data.length);
    }
    _sharedCopy.set(data);
    return _sharedCopy;
  }

  // GPU-accelerated radial vignette overlay using native 2D canvas gradient (0 CPU overhead)
  function drawVignette(ctx, w, h, strength = 0.6) {
    ctx.save();
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.max(cx, cy) * 1.1;
    const grad = ctx.createRadialGradient(cx, cy, radius * 0.25, cx, cy, radius);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // GPU-accelerated duotone color overlay using canvas blending
  function drawDuotoneOverlay(ctx, w, h) {
    ctx.save();
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, 'rgba(76, 29, 149, 0.65)'); // Violet
    grad.addColorStop(1, 'rgba(6, 182, 212, 0.65)');  // Cyan
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Fallback CPU vignette (kept for standalone image export if needed)
  function applyVignette(data, width, height, strength = 0.5) {
    const cx = width / 2;
    const cy = height / 2;
    const maxDist = Math.sqrt(cx * cx + cy * cy);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
        const vignette = 1 - dist * strength;
        data[i]     = clamp(data[i] * vignette);
        data[i + 1] = clamp(data[i + 1] * vignette);
        data[i + 2] = clamp(data[i + 2] * vignette);
      }
    }
  }

  // ═══════════════════════════════════════════
  //  FILTER ALGORITHMS
  // ═══════════════════════════════════════════

  function normal(imageData) {
    return imageData;
  }

  function grayscale(imageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const avg = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i] = data[i + 1] = data[i + 2] = avg;
    }
    return imageData;
  }

  function sepia(imageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      data[i]     = clamp(r * 0.393 + g * 0.769 + b * 0.189);
      data[i + 1] = clamp(r * 0.349 + g * 0.686 + b * 0.168);
      data[i + 2] = clamp(r * 0.272 + g * 0.534 + b * 0.131);
    }
    return imageData;
  }

  function vintage(imageData) {
    const data = imageData.data;
    const w = imageData.width;
    const h = imageData.height;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      data[i]     = clamp(r * 0.65 + g * 0.35 + b * 0.15 + 24);
      data[i + 1] = clamp(r * 0.25 + g * 0.65 + b * 0.12 + 12);
      data[i + 2] = clamp(r * 0.15 + g * 0.22 + b * 0.42 + 18);
    }
    applyVignette(data, w, h, 0.65);
    return imageData;
  }

  function warm(imageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = clamp(data[i] + 30);
      data[i + 1] = clamp(data[i + 1] + 12);
      data[i + 2] = clamp(data[i + 2] - 18);
    }
    return imageData;
  }

  function cool(imageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = clamp(data[i] - 18);
      data[i + 1] = clamp(data[i + 1] + 8);
      data[i + 2] = clamp(data[i + 2] + 36);
    }
    return imageData;
  }

  function highContrast(imageData) {
    const data = imageData.data;
    const factor = 1.65;
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = clamp(factor * (data[i] - 128) + 128);
      data[i + 1] = clamp(factor * (data[i + 1] - 128) + 128);
      data[i + 2] = clamp(factor * (data[i + 2] - 128) + 128);
    }
    return imageData;
  }

  function saturate(imageData) {
    const data = imageData.data;
    const amount = 2.2;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i]     = clamp(gray + amount * (data[i] - gray));
      data[i + 1] = clamp(gray + amount * (data[i] - gray));
      data[i + 2] = clamp(gray + amount * (data[i] - gray));
    }
    return imageData;
  }

  function invert(imageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
    return imageData;
  }

  function lomo(imageData) {
    const data = imageData.data;
    const w = imageData.width;
    const h = imageData.height;

    for (let i = 0; i < data.length; i += 4) {
      data[i]     = clamp(data[i] * 1.35 + 10);
      data[i + 1] = clamp(data[i + 1] * 1.12);
      data[i + 2] = clamp(data[i + 2] * 0.78 - 10);

      data[i]     = clamp(1.3 * (data[i] - 128) + 128);
      data[i + 1] = clamp(1.3 * (data[i + 1] - 128) + 128);
      data[i + 2] = clamp(1.3 * (data[i + 2] - 128) + 128);
    }

    applyVignette(data, w, h, 0.85);
    return imageData;
  }

  function mirror(imageData) {
    const data = imageData.data;
    const w = imageData.width;
    const h = imageData.height;
    const copy = getSharedCopy(data);
    const half = Math.floor(w / 2);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < half; x++) {
        const srcIdx = (y * w + x) * 4;
        const dstIdx = (y * w + (w - 1 - x)) * 4;
        data[dstIdx]     = copy[srcIdx];
        data[dstIdx + 1] = copy[srcIdx + 1];
        data[dstIdx + 2] = copy[srcIdx + 2];
        data[dstIdx + 3] = copy[srcIdx + 3];
      }
    }
    return imageData;
  }

  function kaleidoscope(imageData) {
    const data = imageData.data;
    const w = imageData.width;
    const h = imageData.height;
    const copy = getSharedCopy(data);
    const cx = w / 2;
    const cy = h / 2;

    const segments = 6;
    const segAngle = (2 * Math.PI) / segments;

    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const dx = x - cx;
        const dy = y - cy;
        let angle = Math.atan2(dy, dx);
        const radius = Math.sqrt(dx * dx + dy * dy);

        angle = Math.abs(((angle % segAngle) + segAngle) % segAngle);
        if (angle > segAngle / 2) angle = segAngle - angle;

        const srcX = Math.round(cx + radius * Math.cos(angle));
        const srcY = Math.round(cy + radius * Math.sin(angle));

        if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
          const srcIdx = (srcY * w + srcX) * 4;
          const r = copy[srcIdx];
          const g = copy[srcIdx + 1];
          const b = copy[srcIdx + 2];

          for (let dy2 = 0; dy2 < 2 && y + dy2 < h; dy2++) {
            for (let dx2 = 0; dx2 < 2 && x + dx2 < w; dx2++) {
              const dstIdx = ((y + dy2) * w + (x + dx2)) * 4;
              data[dstIdx]     = r;
              data[dstIdx + 1] = g;
              data[dstIdx + 2] = b;
            }
          }
        }
      }
    }
    return imageData;
  }

  function squeeze(imageData) {
    const data = imageData.data;
    const w = imageData.width;
    const h = imageData.height;
    const copy = getSharedCopy(data);
    const cx = w / 2;
    const cy = h / 2;
    const maxRadius = Math.min(cx, cy);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const r = dist / maxRadius;

        let srcX, srcY;
        if (r < 1) {
          const nr = Math.pow(r, 1.7);
          srcX = Math.round(cx + dx * nr / r);
          srcY = Math.round(cy + dy * nr / r);
        } else {
          srcX = x;
          srcY = y;
        }

        if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
          const dstIdx = (y * w + x) * 4;
          const srcIdx = (srcY * w + srcX) * 4;
          data[dstIdx]     = copy[srcIdx];
          data[dstIdx + 1] = copy[srcIdx + 1];
          data[dstIdx + 2] = copy[srcIdx + 2];
        }
      }
    }
    return imageData;
  }

  function stretch(imageData) {
    const data = imageData.data;
    const w = imageData.width;
    const h = imageData.height;
    const copy = getSharedCopy(data);
    const cx = w / 2;
    const cy = h / 2;
    const maxRadius = Math.min(cx, cy);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const r = dist / maxRadius;

        let srcX, srcY;
        if (r < 1) {
          const nr = Math.pow(r, 0.5);
          srcX = Math.round(cx + dx * nr / (r || 1));
          srcY = Math.round(cy + dy * nr / (r || 1));
        } else {
          srcX = x;
          srcY = y;
        }

        srcX = Math.max(0, Math.min(w - 1, srcX));
        srcY = Math.max(0, Math.min(h - 1, srcY));

        const dstIdx = (y * w + x) * 4;
        const srcIdx = (srcY * w + srcX) * 4;
        data[dstIdx]     = copy[srcIdx];
        data[dstIdx + 1] = copy[srcIdx + 1];
        data[dstIdx + 2] = copy[srcIdx + 2];
      }
    }
    return imageData;
  }

  function pixelate(imageData) {
    const data = imageData.data;
    const w = imageData.width;
    const h = imageData.height;
    const size = 12;

    for (let y = 0; y < h; y += size) {
      for (let x = 0; x < w; x += size) {
        const sx = Math.min(x + Math.floor(size / 2), w - 1);
        const sy = Math.min(y + Math.floor(size / 2), h - 1);
        const si = (sy * w + sx) * 4;
        const r = data[si], g = data[si + 1], b = data[si + 2];

        for (let dy = 0; dy < size && y + dy < h; dy++) {
          for (let dx = 0; dx < size && x + dx < w; dx++) {
            const i = ((y + dy) * w + (x + dx)) * 4;
            data[i]     = r;
            data[i + 1] = g;
            data[i + 2] = b;
          }
        }
      }
    }
    return imageData;
  }

  function comic(imageData) {
    const data = imageData.data;
    const w = imageData.width;
    const h = imageData.height;
    const copy = getSharedCopy(data);

    const levels = 5;
    const step = 255 / levels;
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = Math.round(data[i] / step) * step;
      data[i + 1] = Math.round(data[i + 1] / step) * step;
      data[i + 2] = Math.round(data[i + 2] / step) * step;
    }

    for (let y = 1; y < h - 1; y += 2) {
      for (let x = 1; x < w - 1; x += 2) {
        const idxL = (y * w + (x - 1)) * 4;
        const idxR = (y * w + (x + 1)) * 4;
        const idxU = ((y - 1) * w + x) * 4;
        const idxD = ((y + 1) * w + x) * 4;

        const grayL = copy[idxL] * 0.299 + copy[idxL + 1] * 0.587 + copy[idxL + 2] * 0.114;
        const grayR = copy[idxR] * 0.299 + copy[idxR + 1] * 0.587 + copy[idxR + 2] * 0.114;
        const grayU = copy[idxU] * 0.299 + copy[idxU + 1] * 0.587 + copy[idxU + 2] * 0.114;
        const grayD = copy[idxD] * 0.299 + copy[idxD + 1] * 0.587 + copy[idxD + 2] * 0.114;

        const edgeH = Math.abs(grayL - grayR);
        const edgeV = Math.abs(grayU - grayD);
        const edge = edgeH + edgeV;

        if (edge > 44) {
          const idx = (y * w + x) * 4;
          data[idx] = data[idx + 1] = data[idx + 2] = 12;
          const idx2 = ((y + 1) * w + x) * 4;
          data[idx2] = data[idx2 + 1] = data[idx2 + 2] = 12;
        }
      }
    }
    return imageData;
  }

  function thermal(imageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const t = gray / 255;

      let r, g, b;
      if (t < 0.2) {
        r = 0; g = 0; b = clamp(t * 5 * 200 + 50);
      } else if (t < 0.4) {
        const lt = (t - 0.2) * 5;
        r = 0; g = clamp(lt * 255); b = clamp(255 - lt * 100);
      } else if (t < 0.6) {
        const lt = (t - 0.4) * 5;
        r = clamp(lt * 255); g = 255; b = 0;
      } else if (t < 0.8) {
        const lt = (t - 0.6) * 5;
        r = 255; g = clamp(255 - lt * 255); b = 0;
      } else {
        const lt = (t - 0.8) * 5;
        r = 255; g = clamp(lt * 200); b = clamp(lt * 200);
      }

      data[i]     = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
    return imageData;
  }

  function nightVision(imageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const noise = (Math.random() - 0.5) * 24;
      data[i]     = clamp(gray * 0.15 + noise);
      data[i + 1] = clamp(gray * 1.25 + 35 + noise);
      data[i + 2] = clamp(gray * 0.15 + noise);
    }
    applyVignette(data, imageData.width, imageData.height, 0.8);
    return imageData;
  }

  function popArt(imageData) {
    const data = imageData.data;
    const colors = [
      [244, 63, 94],   // Crimson Rose
      [6, 182, 212],   // Cyan
      [250, 204, 21],  // Vivid Yellow
      [34, 197, 94],   // Bright Green
      [168, 85, 247],  // Purple
    ];
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const idx = Math.min(Math.floor(gray / 52), colors.length - 1);
      const c = colors[idx];
      data[i]     = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
    }
    return imageData;
  }

  function glitch(imageData) {
    const data = imageData.data;
    const w = imageData.width;
    const h = imageData.height;
    const offset = 8;
    const copy = getSharedCopy(data);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const rx = Math.min(x + offset, w - 1);
        const ri = (y * w + rx) * 4;
        data[i] = copy[ri];
        const bx = Math.max(x - offset, 0);
        const bi = (y * w + bx) * 4;
        data[i + 2] = copy[bi + 2];
      }
    }

    for (let g = 0; g < 5; g++) {
      const gy = Math.floor(Math.random() * h);
      const gh = Math.floor(Math.random() * 8) + 2;
      const gShift = Math.floor(Math.random() * 40) - 20;
      for (let y = gy; y < Math.min(gy + gh, h); y++) {
        for (let x = 0; x < w; x++) {
          const dstI = (y * w + x) * 4;
          const srcX = Math.max(0, Math.min(w - 1, x + gShift));
          const srcI = (y * w + srcX) * 4;
          data[dstI]     = copy[srcI];
          data[dstI + 1] = copy[srcI + 1];
          data[dstI + 2] = copy[srcI + 2];
        }
      }
    }
    return imageData;
  }

  function emboss(imageData) {
    const data = imageData.data;
    const w = imageData.width;
    const h = imageData.height;
    const copy = getSharedCopy(data);

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        const iTL = ((y - 1) * w + (x - 1)) * 4;
        const iBR = ((y + 1) * w + (x + 1)) * 4;

        data[i]     = clamp(copy[iBR] - copy[iTL] + 128);
        data[i + 1] = clamp(copy[iBR + 1] - copy[iTL + 1] + 128);
        data[i + 2] = clamp(copy[iBR + 2] - copy[iTL + 2] + 128);
      }
    }
    return imageData;
  }

  function duotone(imageData) {
    const data = imageData.data;
    const dark = [55, 12, 95];     // Violet
    const light = [6, 215, 245];   // Cyan
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
      data[i]     = clamp(dark[0] + (light[0] - dark[0]) * gray);
      data[i + 1] = clamp(dark[1] + (light[1] - dark[1]) * gray);
      data[i + 2] = clamp(dark[2] + (light[2] - dark[2]) * gray);
    }
    return imageData;
  }

  function vhs(imageData) {
    const data = imageData.data;
    const w = imageData.width;
    const h = imageData.height;
    const copy = getSharedCopy(data);

    for (let i = 0; i < data.length; i += 4) {
      data[i]     = clamp(copy[i] * 1.1 + 10);
      data[i + 1] = clamp(copy[i + 1] * 0.9);
      data[i + 2] = clamp(copy[i + 2] * 1.2 + 15);
    }

    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        data[i]     = clamp(data[i] * 0.86);
        data[i + 1] = clamp(data[i + 1] * 0.86);
        data[i + 2] = clamp(data[i + 2] * 0.86);
      }
    }

    for (let n = 0; n < 2; n++) {
      const ny = Math.floor(Math.random() * h);
      for (let x = 0; x < w; x++) {
        const i = (ny * w + x) * 4;
        const noise = (Math.random() - 0.5) * 50;
        data[i]     = clamp(data[i] + noise);
        data[i + 1] = clamp(data[i + 1] + noise);
        data[i + 2] = clamp(data[i + 2] + noise);
      }
    }

    applyVignette(data, w, h, 0.6);
    return imageData;
  }

  // ═══════════════════════════════════════════
  //  CANVAS-LEVEL FILTERS (Multi-face / Clone)
  //  Hardware-accelerated with offscreen buffer caching
  // ═══════════════════════════════════════════

  let _offCanvas = null;
  let _offCtx = null;

  function getOffscreen(w, h) {
    if (!_offCanvas) {
      _offCanvas = document.createElement('canvas');
      _offCtx = _offCanvas.getContext('2d', { willReadFrequently: false });
    }
    if (_offCanvas.width !== w || _offCanvas.height !== h) {
      _offCanvas.width = w;
      _offCanvas.height = h;
    }
    return { canvas: _offCanvas, ctx: _offCtx };
  }

  function canvasGrid(ctx, video, w, h, cols, rows, mirrored) {
    const cellW = Math.ceil(w / cols);
    const cellH = Math.ceil(h / rows);

    // Draw video ONCE into the cell buffer instead of N*N times from video decoder
    const { canvas: cellBuf, ctx: cellCtx } = getOffscreen(cellW, cellH);
    cellCtx.save();
    if (mirrored) {
      cellCtx.translate(cellW, 0);
      cellCtx.scale(-1, 1);
    }
    cellCtx.drawImage(video, 0, 0, cellW, cellH);
    cellCtx.restore();

    ctx.clearRect(0, 0, w, h);
    for (let r = 0; r < rows; r++) {
      const y = r * cellH;
      for (let c = 0; c < cols; c++) {
        const x = c * cellW;
        ctx.drawImage(cellBuf, x, y);
      }
    }
  }

  function canvasMirrorQuad(ctx, video, w, h) {
    const hw = Math.ceil(w / 2);
    const hh = Math.ceil(h / 2);

    // Draw quadrant once
    const { canvas: quadBuf, ctx: qCtx } = getOffscreen(hw, hh);
    qCtx.drawImage(video, 0, 0, hw, hh);

    ctx.clearRect(0, 0, w, h);

    // Top-left: normal
    ctx.drawImage(quadBuf, 0, 0);

    // Top-right: flip horizontal
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(quadBuf, 0, 0);
    ctx.restore();

    // Bottom-left: flip vertical
    ctx.save();
    ctx.translate(0, h);
    ctx.scale(1, -1);
    ctx.drawImage(quadBuf, 0, 0);
    ctx.restore();

    // Bottom-right: flip both
    ctx.save();
    ctx.translate(w, h);
    ctx.scale(-1, -1);
    ctx.drawImage(quadBuf, 0, 0);
    ctx.restore();
  }

  function canvasTunnel(ctx, video, w, h, mirrored) {
    // Cache single video frame
    const { canvas: vBuf, ctx: vCtx } = getOffscreen(w, h);
    vCtx.save();
    if (mirrored) {
      vCtx.translate(w, 0);
      vCtx.scale(-1, 1);
    }
    vCtx.drawImage(video, 0, 0, w, h);
    vCtx.restore();

    ctx.clearRect(0, 0, w, h);
    const layers = 5;
    for (let i = layers; i >= 0; i--) {
      const scale = 1 / Math.pow(1.5, i);
      const dw = w * scale;
      const dh = h * scale;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;
      ctx.drawImage(vBuf, dx, dy, dw, dh);

      if (i > 0) {
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(dx, dy, dw, dh);
      }
    }
  }

  function canvasPopArtGrid(ctx, video, w, h) {
    const hw = Math.ceil(w / 2);
    const hh = Math.ceil(h / 2);

    const { canvas: quadBuf, ctx: qCtx } = getOffscreen(hw, hh);
    qCtx.drawImage(video, 0, 0, hw, hh);

    const tints = [
      'rgba(255, 60, 110, 0.4)',
      'rgba(40, 210, 255, 0.4)',
      'rgba(255, 225, 40, 0.4)',
      'rgba(60, 255, 120, 0.4)'
    ];
    const positions = [[0, 0], [hw, 0], [0, hh], [hw, hh]];

    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      const [px, py] = positions[i];
      ctx.drawImage(quadBuf, px, py);
      ctx.fillStyle = tints[i];
      ctx.fillRect(px, py, hw, hh);
    }
  }

  function canvasStripe(ctx, video, w, h, mirrored) {
    const { canvas: vBuf, ctx: vCtx } = getOffscreen(w, h);
    vCtx.save();
    if (mirrored) {
      vCtx.translate(w, 0);
      vCtx.scale(-1, 1);
    }
    vCtx.drawImage(video, 0, 0, w, h);
    vCtx.restore();

    const cols = 6;
    const cellW = Math.ceil(w / cols);
    ctx.clearRect(0, 0, w, h);
    for (let c = 0; c < cols; c++) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cellW * c, 0, cellW, h);
      ctx.clip();
      if (c % 2 === 1) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(vBuf, 0, 0);
      ctx.restore();
    }
  }

  function canvasPixelate(ctx, video, w, h, mirrored) {
    const cellSize = 14;
    const sw = Math.max(1, Math.round(w / cellSize));
    const sh = Math.max(1, Math.round(h / cellSize));
    const { canvas: offC, ctx: offCtx } = getOffscreen(sw, sh);
    offCtx.save();
    if (mirrored) {
      offCtx.translate(sw, 0);
      offCtx.scale(-1, 1);
    }
    offCtx.drawImage(video, 0, 0, sw, sh);
    offCtx.restore();

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offC, 0, 0, w, h);
    ctx.restore();
  }

  function canvasSplitMirror(ctx, video, w, h, mirrored) {
    const hw = Math.ceil(w / 2);
    const { canvas: vBuf, ctx: vCtx } = getOffscreen(w, h);
    vCtx.save();
    if (mirrored) {
      vCtx.translate(w, 0);
      vCtx.scale(-1, 1);
    }
    vCtx.drawImage(video, 0, 0, w, h);
    vCtx.restore();

    ctx.clearRect(0, 0, w, h);
    // Left half normal
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, hw, h);
    ctx.clip();
    ctx.drawImage(vBuf, 0, 0);
    ctx.restore();

    // Right half flip horizontal
    ctx.save();
    ctx.beginPath();
    ctx.rect(hw, 0, hw, h);
    ctx.clip();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(vBuf, 0, 0);
    ctx.restore();
  }

  // Map of canvas filter IDs to their render functions (100% GPU accelerated drawImage/transforms)
  const canvasFilters = {
    'clone-4':     (ctx, v, w, h, m) => canvasGrid(ctx, v, w, h, 2, 2, m),
    'clone-9':     (ctx, v, w, h, m) => canvasGrid(ctx, v, w, h, 3, 3, m),
    'clone-16':    (ctx, v, w, h, m) => canvasGrid(ctx, v, w, h, 4, 4, m),
    'clone-25':    (ctx, v, w, h, m) => canvasGrid(ctx, v, w, h, 5, 5, m),
    'mirror-quad': (ctx, v, w, h) => canvasMirrorQuad(ctx, v, w, h),
    'tunnel':      (ctx, v, w, h, m) => canvasTunnel(ctx, v, w, h, m),
    'pop-grid':    (ctx, v, w, h) => canvasPopArtGrid(ctx, v, w, h),
    'stripe':      (ctx, v, w, h, m) => canvasStripe(ctx, v, w, h, m),
    'pixelate':    (ctx, v, w, h, m) => canvasPixelate(ctx, v, w, h, m),
    'mirror':      (ctx, v, w, h, m) => canvasSplitMirror(ctx, v, w, h, m),
  };

  // GPU Hardware-Accelerated Filters (using native Direct3D/Metal/OpenGL via ctx.filter)
  const gpuFilters = {
    'normal':       { filter: 'none' },
    'grayscale':    { filter: 'grayscale(100%)' },
    'sepia':        { filter: 'sepia(100%)' },
    'vintage':      { filter: 'sepia(60%) contrast(115%) brightness(95%)', vignette: 0.6 },
    'warm':         { filter: 'sepia(35%) saturate(145%) brightness(105%)' },
    'cool':         { filter: 'hue-rotate(180deg) sepia(20%) saturate(120%)' },
    'highContrast': { filter: 'contrast(175%)' },
    'saturate':     { filter: 'saturate(220%)' },
    'invert':       { filter: 'invert(100%)' },
    'lomo':         { filter: 'contrast(140%) saturate(145%) brightness(105%)', vignette: 0.75 },
    'duotone':      { filter: 'grayscale(100%) contrast(160%)', duotone: true }
  };

  // ═══════════════════════════════════════════
  //  HIGH CONTRAST VIBRANT PRESET REGISTRY
  // ═══════════════════════════════════════════

  const registry = [
    // Tone & Color
    {
      id: 'normal',
      name: 'Original',
      code: 'RAW',
      category: 'color',
      tag: 'Neutral',
      swatch: 'linear-gradient(135deg, #475569 0%, #94a3b8 100%)',
      fn: normal
    },
    {
      id: 'grayscale',
      name: 'Noir Mono',
      code: 'B&W',
      category: 'color',
      tag: 'Classic',
      swatch: 'linear-gradient(135deg, #09090b 50%, #f4f4f5 50%)',
      fn: grayscale
    },
    {
      id: 'sepia',
      name: 'Sepia 70s',
      code: 'SEP',
      category: 'color',
      tag: 'Warmth',
      swatch: 'linear-gradient(135deg, #572c08 0%, #d97706 60%, #fed7aa 100%)',
      fn: sepia
    },
    {
      id: 'vintage',
      name: 'Retro 80s',
      code: 'VNTG',
      category: 'color',
      tag: 'Film',
      swatch: 'radial-gradient(circle, #fde68a 20%, #92400e 65%, #301306 100%)',
      fn: vintage
    },
    {
      id: 'warm',
      name: 'Golden Hour',
      code: 'GOLD',
      category: 'color',
      tag: 'Sunset',
      swatch: 'linear-gradient(135deg, #ea580c 0%, #f59e0b 50%, #fde047 100%)',
      fn: warm
    },
    {
      id: 'cool',
      name: 'Nordic Frost',
      code: 'COOL',
      category: 'color',
      tag: 'Ice Cyan',
      swatch: 'linear-gradient(135deg, #0369a1 0%, #38bdf8 60%, #bae6fd 100%)',
      fn: cool
    },
    {
      id: 'highContrast',
      name: 'High Key',
      code: 'CONT',
      category: 'color',
      tag: 'Stark',
      swatch: 'linear-gradient(90deg, #000000 50%, #ffffff 50%)',
      fn: highContrast
    },
    {
      id: 'saturate',
      name: 'Prism Color',
      code: 'VIVID',
      category: 'color',
      tag: 'Vibrant',
      swatch: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 50%, #06b6d4 100%)',
      fn: saturate
    },
    {
      id: 'invert',
      name: 'Negative',
      code: 'INVT',
      category: 'color',
      tag: 'X-Ray',
      swatch: 'linear-gradient(135deg, #ffffff 48%, #09090b 52%)',
      fn: invert
    },
    {
      id: 'lomo',
      name: 'Lomo LC-A',
      code: 'LOMO',
      category: 'color',
      tag: 'Teal/Red',
      swatch: 'radial-gradient(circle, #38bdf8 20%, #e11d48 70%, #020617 100%)',
      fn: lomo
    },

    // Distortion & Lens
    {
      id: 'mirror',
      name: 'Split Mirror',
      code: 'MIRR',
      category: 'distortion',
      tag: 'Symmetry',
      swatch: 'linear-gradient(90deg, #2563eb 47%, #93c5fd 50%, #2563eb 53%)',
      type: 'canvas',
      fn: mirror
    },
    {
      id: 'kaleidoscope',
      name: 'Kaleido',
      code: 'KLDO',
      category: 'distortion',
      tag: 'Prism 6X',
      swatch: 'conic-gradient(from 0deg, #ef4444, #f59e0b, #10b981, #06b6d4, #8b5cf6, #ec4899, #ef4444)',
      fn: kaleidoscope
    },
    {
      id: 'squeeze',
      name: 'Pinch Lens',
      code: 'PNCH',
      category: 'distortion',
      tag: 'Vortex',
      swatch: 'radial-gradient(circle at center, #a5b4fc 10%, #4338ca 50%, #030712 90%)',
      fn: squeeze
    },
    {
      id: 'stretch',
      name: 'Anamorphic',
      code: 'STRT',
      category: 'distortion',
      tag: 'Wide Lens',
      swatch: 'linear-gradient(90deg, #111827 0%, #6366f1 50%, #111827 100%)',
      fn: stretch
    },

    // Special FX
    {
      id: 'pixelate',
      name: '8-Bit Mosaic',
      code: 'PIXL',
      category: 'fun',
      tag: 'Retro Grid',
      swatch: 'repeating-conic-gradient(#059669 0% 25%, #10b981 0% 50%) 50% / 12px 12px',
      type: 'canvas',
      fn: pixelate
    },
    {
      id: 'comic',
      name: 'Graphic Novel',
      code: 'INK',
      category: 'fun',
      tag: 'Halftone',
      swatch: 'radial-gradient(#000000 32%, #ffffff 33%) 0 0 / 8px 8px',
      fn: comic
    },
    {
      id: 'thermal',
      name: 'Infrared IR',
      code: 'THRM',
      category: 'fun',
      tag: 'Heat Map',
      swatch: 'linear-gradient(90deg, #1e3a8a 0%, #06b6d4 25%, #22c55e 50%, #facc15 75%, #ef4444 100%)',
      fn: thermal
    },
    {
      id: 'nightVision',
      name: 'Phosphor NV',
      code: 'NV-9',
      category: 'fun',
      tag: 'Military',
      swatch: 'radial-gradient(circle, #86efac 15%, #15803d 60%, #022c22 100%)',
      fn: nightVision
    },
    {
      id: 'popArt',
      name: 'Warhol Pop',
      code: 'WARH',
      category: 'fun',
      tag: '4-Color',
      swatch: 'conic-gradient(#f43f5e 25%, #facc15 0 50%, #06b6d4 0 75%, #4ade80 0)',
      fn: popArt
    },
    {
      id: 'glitch',
      name: 'Cyber Glitch',
      code: 'GLCH',
      category: 'fun',
      tag: 'RGB Shift',
      swatch: 'linear-gradient(90deg, #ef4444 33%, #06b6d4 66%, #ffffff 100%)',
      fn: glitch
    },
    {
      id: 'emboss',
      name: 'Bas Relief',
      code: 'RELF',
      category: 'fun',
      tag: 'Stone 3D',
      swatch: 'linear-gradient(135deg, #475569 0%, #94a3b8 50%, #f1f5f9 100%)',
      fn: emboss
    },
    {
      id: 'duotone',
      name: 'Cyber Neon',
      code: 'DUO',
      category: 'fun',
      tag: 'Neon Dual',
      swatch: 'linear-gradient(135deg, #4c1d95 0%, #06b6d4 100%)',
      fn: duotone
    },
    {
      id: 'vhs',
      name: 'Tape 1994',
      code: 'VHS',
      category: 'fun',
      tag: 'Analog CRT',
      swatch: 'repeating-linear-gradient(0deg, #1e1b4b 0 3px, #6366f1 3px 6px)',
      fn: vhs
    },

    // ─── Multi-Face / Clone Category ───
    {
      id: 'clone-4',
      name: 'Clone 2×2',
      code: 'CL4',
      category: 'multi',
      tag: '4 Wajah',
      swatch: 'repeating-conic-gradient(#6366f1 0% 25%, #1e1b4b 0% 50%) 50% / 50% 50%',
      type: 'canvas',
      fn: null
    },
    {
      id: 'clone-9',
      name: 'Clone 3×3',
      code: 'CL9',
      category: 'multi',
      tag: '9 Wajah',
      swatch: 'repeating-conic-gradient(#8b5cf6 0% 25%, #2e1065 0% 50%) 50% / 33.3% 33.3%',
      type: 'canvas',
      fn: null
    },
    {
      id: 'clone-16',
      name: 'Clone 4×4',
      code: 'CL16',
      category: 'multi',
      tag: '16 Wajah',
      swatch: 'repeating-conic-gradient(#a78bfa 0% 25%, #3b0764 0% 50%) 50% / 25% 25%',
      type: 'canvas',
      fn: null
    },
    {
      id: 'clone-25',
      name: 'Clone 5×5',
      code: 'CL25',
      category: 'multi',
      tag: '25 Wajah',
      swatch: 'repeating-conic-gradient(#c4b5fd 0% 25%, #4c1d95 0% 50%) 50% / 20% 20%',
      type: 'canvas',
      fn: null
    },
    {
      id: 'mirror-quad',
      name: 'Mirror Quad',
      code: 'MQAD',
      category: 'multi',
      tag: '4 Mirror',
      swatch: 'conic-gradient(from 0deg, #2563eb 25%, #60a5fa 25% 50%, #2563eb 50% 75%, #60a5fa 75%)',
      type: 'canvas',
      fn: null
    },
    {
      id: 'pop-grid',
      name: 'Pop Art Grid',
      code: 'POPG',
      category: 'multi',
      tag: '4 Warna',
      swatch: 'conic-gradient(#f43f5e 25%, #38bdf8 25% 50%, #facc15 50% 75%, #4ade80 75%)',
      type: 'canvas',
      fn: null
    },
    {
      id: 'tunnel',
      name: 'Tunnel Zoom',
      code: 'TUNL',
      category: 'multi',
      tag: 'Recursive',
      swatch: 'radial-gradient(circle, #e0e7ff 10%, #6366f1 35%, #312e81 60%, #0f0a27 90%)',
      type: 'canvas',
      fn: null
    },
    {
      id: 'stripe',
      name: 'Strip Mirror',
      code: 'STRP',
      category: 'multi',
      tag: '6 Strip',
      swatch: 'repeating-linear-gradient(90deg, #818cf8 0 16.6%, #1e1b4b 16.6% 33.3%)',
      type: 'canvas',
      fn: null
    },
  ];

  return {
    registry,
    getFilter: (id) => registry.find(f => f.id === id),
    getByCategory: (cat) => cat === 'all' ? registry : registry.filter(f => f.category === cat),
    isCanvasFilter: (id) => !!canvasFilters[id],
    isGpuFilter: (id) => !!gpuFilters[id],
    applyGpu: (id, ctx, video, w, h, mirrored) => {
      const cfg = gpuFilters[id];
      if (!cfg) return false;
      ctx.save();
      ctx.filter = cfg.filter || 'none';
      if (mirrored) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, w, h);
      ctx.filter = 'none';
      ctx.restore();

      if (cfg.vignette) {
        drawVignette(ctx, w, h, cfg.vignette);
      }
      if (cfg.duotone) {
        drawDuotoneOverlay(ctx, w, h);
      }
      return true;
    },
    applyCanvas: (id, ctx, video, w, h, mirrored) => {
      const fn = canvasFilters[id];
      if (fn) fn(ctx, video, w, h, mirrored);
    },
    apply: (id, imageData) => {
      const filter = registry.find(f => f.id === id);
      return (filter && filter.fn) ? filter.fn(imageData) : imageData;
    }
  };

})();
