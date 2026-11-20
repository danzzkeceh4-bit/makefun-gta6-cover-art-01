// Vice Cover Studio — poster renderer.
//
// Everything the cover looks like lives here: the panel geometry for each
// layout, the way a photo is fitted and panned inside a panel, the colour
// grades, the film grain, and the big caption lettering. It draws onto any
// 2D canvas the caller hands it, at whatever pixel size that canvas has,
// so the live preview and the exported PNG are the same drawing at two
// sizes. No dependencies, no network: photos and the font come from app/.
//
// Classic script. It exposes one global, window.CoverArt.

(function () {
  'use strict';

  var PAPER = '#f5f0e6'; // warm off-white gutters, like a printed poster
  var INK = '#14121a';

  // The six layouts. `panels` is how many photo slots each one has.
  var LAYOUTS = [
    { id: 'hero', label: 'Hero', panels: 1 },
    { id: 'split-v', label: 'Split V', panels: 2 },
    { id: 'split-h', label: 'Split H', panels: 2 },
    { id: 'trio', label: 'Trio', panels: 3 },
    { id: 'quad', label: 'Quad', panels: 4 },
    { id: 'slash', label: 'Slash', panels: 2 },
  ];

  // The four colour grades.
  var GRADES = [
    { id: 'sunset', label: 'Sunset' },
    { id: 'neon', label: 'Neon' },
    { id: 'noir', label: 'Noir' },
    { id: 'original', label: 'Original' },
  ];

  // The three export sizes, keyed the way the editor stores them.
  var SIZES = {
    landscape: { label: '1920 × 1080', w: 1920, h: 1080 },
    square: { label: '1080 × 1080', w: 1080, h: 1080 },
    portrait: { label: '1080 × 1350', w: 1080, h: 1350 },
  };

  // Panel rectangles for a cover of W x H. The gutter `g` grows with the
  // cover so the seams look the same at preview and export size. The slash
  // layout gets clip polygons instead of rectangles: two panels cut by one
  // diagonal, which is what makes it read as a poster fold.
  function panelGeometry(layoutId, W, H) {
    var g = Math.max(8, Math.round(W * 0.008));
    var list = [];
    if (layoutId === 'split-v') {
      var halfW = (W - g) / 2;
      list.push({ x: 0, y: 0, w: halfW, h: H });
      list.push({ x: halfW + g, y: 0, w: halfW, h: H });
    } else if (layoutId === 'split-h') {
      var halfH = (H - g) / 2;
      list.push({ x: 0, y: 0, w: W, h: halfH });
      list.push({ x: 0, y: halfH + g, w: W, h: halfH });
    } else if (layoutId === 'trio') {
      var bigW = Math.round(W * 0.6);
      var sideX = bigW + g;
      var sideW = W - sideX;
      var stackH = (H - g) / 2;
      list.push({ x: 0, y: 0, w: bigW, h: H });
      list.push({ x: sideX, y: 0, w: sideW, h: stackH });
      list.push({ x: sideX, y: stackH + g, w: sideW, h: stackH });
    } else if (layoutId === 'quad') {
      var cellW = (W - g) / 2;
      var cellH = (H - g) / 2;
      list.push({ x: 0, y: 0, w: cellW, h: cellH });
      list.push({ x: cellW + g, y: 0, w: cellW, h: cellH });
      list.push({ x: 0, y: cellH + g, w: cellW, h: cellH });
      list.push({ x: cellW + g, y: cellH + g, w: cellW, h: cellH });
    } else if (layoutId === 'slash') {
      var topEdge = Math.round(W * 0.64);
      var botEdge = Math.round(W * 0.36);
      list.push({
        x: 0, y: 0, w: topEdge, h: H, diagonal: true,
        outline: [[0, 0], [topEdge, 0], [botEdge, H], [0, H]],
      });
      list.push({
        x: botEdge, y: 0, w: W - botEdge, h: H, diagonal: true,
        outline: [[topEdge, 0], [W, 0], [W, H], [botEdge, H]],
      });
    } else {
      // 'hero' and anything unknown: one panel, full bleed.
      list.push({ x: 0, y: 0, w: W, h: H });
    }
    return { panels: list, gutter: g };
  }

  // Cover-fit: scale the photo so it covers the panel, then place it so
  // the point (fx, fy) — fractions of the photo, 0..1 — sits at the panel
  // centre. zoom 1 is the tightest fit that still covers; zooming in lets
  // the user crop deeper, and fx/fy pan the crop around.
  function coverFit(img, panel, zoom, fx, fy) {
    var base = Math.max(panel.w / img.naturalWidth, panel.h / img.naturalHeight);
    var scale = base * zoom;
    var dw = img.naturalWidth * scale;
    var dh = img.naturalHeight * scale;
    return {
      x: panel.x + panel.w / 2 - fx * dw,
      y: panel.y + panel.h / 2 - fy * dh,
      w: dw,
      h: dh,
    };
  }

  // Keep the pan inside the photo: when the drawn photo is wider than the
  // panel, fx may only move between the two edges; when it is not wider
  // than the panel, fx is forced to the middle (there is nothing to pan).
  function clampPan(panel, drawn, fx, fy) {
    function clampAxis(panelLen, drawnLen, f) {
      if (drawnLen <= panelLen) return 0.5;
      var edge = panelLen / (2 * drawnLen);
      return Math.min(1 - edge, Math.max(edge, f));
    }
    return {
      fx: clampAxis(panel.w, drawn.w, fx),
      fy: clampAxis(panel.h, drawn.h, fy),
    };
  }

  // The canvas filter applied while each photo is drawn.
  function gradeFilter(gradeId) {
    if (gradeId === 'sunset') return 'saturate(1.45) contrast(1.1) brightness(1.04)';
    if (gradeId === 'neon') return 'saturate(1.9) contrast(1.16) brightness(1.03)';
    if (gradeId === 'noir') return 'grayscale(1) contrast(1.35) brightness(1.05)';
    return 'saturate(1.1) contrast(1.05)';
  }

  // Three colours per grade: used for the title gradient, the tint overlay
  // and the placeholder panels when a slot has no photo yet.
  function gradePalette(gradeId) {
    if (gradeId === 'sunset') return ['#ff7a18', '#ff2e88', '#7b2ff7'];
    if (gradeId === 'neon') return ['#ff00c8', '#7b2ff7', '#00e5ff'];
    if (gradeId === 'noir') return ['#55555f', '#8f8f9a', '#d2d2da'];
    return ['#ffb36b', '#ff8a5c', '#ffd9a0'];
  }

  // The small accent colour: the subtitle line and the selection tag.
  function gradeAccent(gradeId) {
    if (gradeId === 'neon') return '#00e5ff';
    if (gradeId === 'noir') return '#ffffff';
    if (gradeId === 'original') return '#ff7a18';
    return '#ff2e88';
  }

  // The title is filled with a vertical gradient: white at the top of the
  // letters warming into the grade's lead colour at the baseline.
  function titleFill(ctx, topY, bottomY, gradeId) {
    var pal = gradePalette(gradeId);
    var grad = ctx.createLinearGradient(0, topY, 0, bottomY);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.6, pal[0]);
    grad.addColorStop(1, pal[1]);
    return grad;
  }

  // Deterministic grain: one small noise tile, made once from a fixed seed,
  // then tiled over the whole cover. Same seed every run, so the export is
  // byte-stable for a given cover.
  var grainTile = null;
  function noiseTile() {
    if (grainTile) return grainTile;
    var size = 128;
    var tile = document.createElement('canvas');
    tile.width = size;
    tile.height = size;
    var tctx = tile.getContext('2d');
    var pixels = tctx.createImageData(size, size);
    var seed = 20261121;
    function next() {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    for (var i = 0; i < pixels.data.length; i += 4) {
      var v = Math.floor(next() * 255);
      pixels.data[i] = v;
      pixels.data[i + 1] = v;
      pixels.data[i + 2] = v;
      pixels.data[i + 3] = 255;
    }
    tctx.putImageData(pixels, 0, 0);
    grainTile = tile;
    return tile;
  }

  function clipToPanel(ctx, panel) {
    ctx.beginPath();
    if (panel.outline) {
      ctx.moveTo(panel.outline[0][0], panel.outline[0][1]);
      for (var i = 1; i < panel.outline.length; i++) {
        ctx.lineTo(panel.outline[i][0], panel.outline[i][1]);
      }
      ctx.closePath();
    } else {
      ctx.rect(panel.x, panel.y, panel.w, panel.h);
    }
    ctx.clip();
  }

  function paintPhoto(ctx, panel, img, slot) {
    ctx.save();
    clipToPanel(ctx, panel);
    var drawn = coverFit(img, panel, slot.zoom, slot.fx, slot.fy);
    ctx.drawImage(img, drawn.x, drawn.y, drawn.w, drawn.h);
    ctx.restore();
  }

  function paintPlaceholder(ctx, panel, gradeId) {
    var pal = gradePalette(gradeId);
    var grad = ctx.createLinearGradient(panel.x, panel.y, panel.x + panel.w, panel.y + panel.h);
    grad.addColorStop(0, pal[0]);
    grad.addColorStop(1, pal[2]);
    ctx.save();
    ctx.fillStyle = grad;
    if (panel.outline) {
      ctx.beginPath();
      ctx.moveTo(panel.outline[0][0], panel.outline[0][1]);
      for (var i = 1; i < panel.outline.length; i++) {
        ctx.lineTo(panel.outline[i][0], panel.outline[i][1]);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
    }
    ctx.restore();
  }

  // The grade pass: a tinted diagonal wash, a warm bottom glow for sunset,
  // a magenta bloom for neon, then the vignette and the grain. All of it
  // sits over the photos and under the caption.
  function paintGrade(ctx, W, H, gradeId) {
    var pal = gradePalette(gradeId);
    ctx.save();

    var tint = ctx.createLinearGradient(0, 0, W, H);
    tint.addColorStop(0, pal[0]);
    tint.addColorStop(0.5, pal[1]);
    tint.addColorStop(1, pal[2]);
    ctx.globalCompositeOperation = gradeId === 'noir' ? 'soft-light' : 'overlay';
    ctx.globalAlpha = gradeId === 'original' ? 0.2 : gradeId === 'noir' ? 0.28 : 0.48;
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, W, H);

    if (gradeId === 'sunset') {
      var warm = ctx.createLinearGradient(0, H * 0.35, 0, H);
      warm.addColorStop(0, 'rgba(255, 90, 40, 0)');
      warm.addColorStop(1, 'rgba(255, 90, 40, 0.3)');
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = 1;
      ctx.fillStyle = warm;
      ctx.fillRect(0, 0, W, H);
    }
    if (gradeId === 'neon') {
      var bloom = ctx.createRadialGradient(W * 0.82, H * 0.12, 0, W * 0.82, H * 0.12, W * 0.6);
      bloom.addColorStop(0, 'rgba(255, 0, 200, 0.32)');
      bloom.addColorStop(1, 'rgba(255, 0, 200, 0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 1;
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, W, H);
    }

    // Vignette: darkened corners, so the eye lands in the middle.
    var vig = ctx.createRadialGradient(
      W / 2, H / 2, Math.min(W, H) * 0.4,
      W / 2, H / 2, Math.max(W, H) * 0.78
    );
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, gradeId === 'noir' ? 'rgba(0, 0, 0, 0.52)' : 'rgba(0, 0, 0, 0.36)');
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // Grain, faint, over everything.
    var tile = noiseTile();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = ctx.createPattern(tile, 'repeat');
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Letter-spaced text: a hair space between glyphs, the poster look.
  function spaced(text) {
    return text.split('').join(' ');
  }

  function strokeAndFill(ctx, text, x, y, font, fill, outlinePx) {
    ctx.font = font;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = INK;
    ctx.lineWidth = outlinePx;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  // The caption: subtitle above the title, both tilted a couple of degrees
  // and overlapping the panels near the foot of the cover; the footer line
  // sits small at the bottom right. The title shrinks until it fits.
  function paintCaption(ctx, W, H, cover) {
    var title = (cover.title || '').toUpperCase();
    var subtitle = (cover.subtitle || '').toUpperCase();
    var footer = cover.footer || '';
    if (!title && !subtitle && !footer) return;

    var stack = '"Anton", "Arial Black", sans-serif';
    var titlePx = Math.round(W * 0.12);
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    ctx.font = titlePx + 'px ' + stack;
    var fitW = W * 0.93;
    var measured = ctx.measureText(title).width;
    if (measured > fitW) titlePx = Math.max(24, Math.floor(titlePx * fitW / measured));

    var x = Math.round(W * 0.045);
    var titleY = Math.round(H * 0.9);
    var subPx = Math.max(18, Math.round(titlePx * 0.32));
    var subY = titleY - Math.round(titlePx * 1.05);

    ctx.translate(x, titleY);
    ctx.rotate(-2 * Math.PI / 180);
    ctx.translate(-x, -titleY);

    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = Math.round(titlePx * 0.07);
    ctx.shadowOffsetX = Math.round(titlePx * 0.02);
    ctx.shadowOffsetY = Math.round(titlePx * 0.035);

    if (subtitle) {
      strokeAndFill(
        ctx, spaced(subtitle), x + Math.round(titlePx * 0.06), subY,
        subPx + 'px ' + stack, gradeAccent(cover.grade), Math.max(3, subPx * 0.14)
      );
    }
    if (title) {
      strokeAndFill(
        ctx, title, x, titleY,
        titlePx + 'px ' + stack,
        titleFill(ctx, titleY - titlePx, titleY + Math.round(titlePx * 0.12), cover.grade),
        Math.max(4, titlePx * 0.07)
      );
    }
    ctx.restore();

    if (footer) {
      ctx.save();
      ctx.font = '700 ' + Math.max(14, Math.round(W * 0.016)) + 'px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
      ctx.shadowBlur = Math.round(W * 0.004);
      ctx.shadowOffsetY = Math.round(W * 0.002);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(footer.toUpperCase(), Math.round(W * 0.955), Math.round(H * 0.965));
      ctx.restore();
    }
  }

  // Editor-only overlay: a dashed frame and a tag naming the selected panel.
  function paintSelection(ctx, panels, selected) {
    if (selected == null || !panels[selected]) return;
    var p = panels[selected];
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 10]);
    ctx.strokeRect(p.x + 2, p.y + 2, p.w - 4, p.h - 4);
    ctx.setLineDash([]);
    ctx.fillStyle = '#ff2e88';
    ctx.font = '700 15px system-ui, sans-serif';
    var tag = 'PANEL ' + (selected + 1);
    var tagW = ctx.measureText(tag).width + 18;
    ctx.fillRect(p.x + 6, p.y + 6, tagW, 26);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tag, p.x + 15, p.y + 24);
    ctx.restore();
  }

  // Draws the whole cover onto `canvas` at the canvas's own pixel size.
  // cover: { layout, grade, title, subtitle, footer, panels: [{photo, zoom, fx, fy}] }
  // photos: array of loaded images (a slot with no photo gets a placeholder).
  // opts: { selected, showSelection }
  function drawCover(canvas, cover, photos, opts) {
    var options = opts || {};
    var W = canvas.width;
    var H = canvas.height;
    var ctx = canvas.getContext('2d');
    var geometry = panelGeometry(cover.layout, W, H);
    var panels = geometry.panels;

    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    ctx.filter = gradeFilter(cover.grade);
    for (var i = 0; i < panels.length; i++) {
      var slot = (cover.panels && cover.panels[i]) || { photo: 0, zoom: 1, fx: 0.5, fy: 0.5 };
      var img = photos ? photos[slot.photo] : null;
      if (img && img.naturalWidth > 0) {
        // Clamp at draw time: a pan that fit one cover size can leave a
        // bare strip at another, so never draw it uncovered.
        var probe = coverFit(img, panels[i], slot.zoom, slot.fx, slot.fy);
        var clamped = clampPan(panels[i], probe, slot.fx, slot.fy);
        paintPhoto(ctx, panels[i], img, {
          zoom: slot.zoom, fx: clamped.fx, fy: clamped.fy,
        });
      } else {
        paintPlaceholder(ctx, panels[i], cover.grade);
      }
    }
    ctx.filter = 'none';

    // The slash layout's diagonal seam, drawn over the photos.
    if (cover.layout === 'slash') {
      ctx.strokeStyle = PAPER;
      ctx.lineWidth = geometry.gutter * 1.6;
      ctx.beginPath();
      ctx.moveTo(Math.round(W * 0.64), 0);
      ctx.lineTo(Math.round(W * 0.36), H);
      ctx.stroke();
    }

    paintGrade(ctx, W, H, cover.grade);
    paintCaption(ctx, W, H, cover);
    if (options.showSelection) paintSelection(ctx, panels, options.selected);
    ctx.restore();
    return geometry;
  }

  // The same cover on a fresh canvas at export size, for the PNG download.
  function exportCover(cover, photos, w, h) {
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    drawCover(canvas, cover, photos, {});
    return canvas;
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('could not load image')); };
      img.src = src;
    });
  }

  function loadAnton() {
    if (document.fonts && document.fonts.load) {
      return document.fonts.load('100px "Anton"').catch(function () {});
    }
    return Promise.resolve();
  }

  window.CoverArt = {
    LAYOUTS: LAYOUTS,
    GRADES: GRADES,
    SIZES: SIZES,
    panelGeometry: panelGeometry,
    coverFit: coverFit,
    clampPan: clampPan,
    drawCover: drawCover,
    exportCover: exportCover,
    loadImage: loadImage,
    loadAnton: loadAnton,
  };
})();
