// Vice Cover Studio — cover renderer.
// Draws the multi-panel GTA-style poster: photos in layout panels, a colour
// grade, and big outlined caption lettering. Pure canvas 2D, no dependencies.
// Classic script: exposes one global, window.ViceCover.

(function () {
  'use strict';

  var GUTTER_COLOR = '#f4efe6';
  var INK = '#111016';

  var LAYOUTS = [
    { id: 'hero', label: 'Hero', panels: 1 },
    { id: 'split-v', label: 'Split V', panels: 2 },
    { id: 'split-h', label: 'Split H', panels: 2 },
    { id: 'trio', label: 'Trio', panels: 3 },
    { id: 'quad', label: 'Quad', panels: 4 },
    { id: 'slash', label: 'Slash', panels: 2 },
  ];

  var GRADES = [
    { id: 'sunset', label: 'Sunset' },
    { id: 'neon', label: 'Neon' },
    { id: 'noir', label: 'Noir' },
    { id: 'original', label: 'Original' },
  ];

  var SIZES = {
    landscape: { label: '1920 × 1080', w: 1920, h: 1080 },
    square: { label: '1080 × 1080', w: 1080, h: 1080 },
    portrait: { label: '1080 × 1350', w: 1080, h: 1350 },
  };

  // Panel rectangles (and, for the slash layout, clip polygons) for a cover
  // of W x H. Gutter g separates the panels like a printed poster.
  function layoutPanels(layoutId, W, H) {
    var g = Math.max(6, Math.round(W * 0.007));
    var panels = [];
    if (layoutId === 'hero') {
      panels.push({ x: 0, y: 0, w: W, h: H });
    } else if (layoutId === 'split-v') {
      var halfW = (W - g) / 2;
      panels.push({ x: 0, y: 0, w: halfW, h: H });
      panels.push({ x: halfW + g, y: 0, w: halfW, h: H });
    } else if (layoutId === 'split-h') {
      var halfH = (H - g) / 2;
      panels.push({ x: 0, y: 0, w: W, h: halfH });
      panels.push({ x: 0, y: halfH + g, w: W, h: halfH });
    } else if (layoutId === 'trio') {
      var leftW = Math.round(W * 0.62);
      var rightX = leftW + g;
      var rightW = W - rightX;
      var stackH = (H - g) / 2;
      panels.push({ x: 0, y: 0, w: leftW, h: H });
      panels.push({ x: rightX, y: 0, w: rightW, h: stackH });
      panels.push({ x: rightX, y: stackH + g, w: rightW, h: stackH });
    } else if (layoutId === 'quad') {
      var cellW = (W - g) / 2;
      var cellH = (H - g) / 2;
      panels.push({ x: 0, y: 0, w: cellW, h: cellH });
      panels.push({ x: cellW + g, y: 0, w: cellW, h: cellH });
      panels.push({ x: 0, y: cellH + g, w: cellW, h: cellH });
      panels.push({ x: cellW + g, y: cellH + g, w: cellW, h: cellH });
    } else if (layoutId === 'slash') {
      var topX = Math.round(W * 0.66);
      var botX = Math.round(W * 0.34);
      panels.push({
        x: 0, y: 0, w: topX, h: H,
        points: [[0, 0], [topX, 0], [botX, H], [0, H]],
        slash: true,
      });
      panels.push({
        x: botX, y: 0, w: W - botX, h: H,
        points: [[topX, 0], [W, 0], [W, H], [botX, H]],
        slash: true,
      });
    } else {
      panels.push({ x: 0, y: 0, w: W, h: H });
    }
    return { panels: panels, gutter: g };
  }

  // Cover-fit geometry for one photo inside one panel, with zoom and pan.
  // zoom 1 fills the panel; cx/cy (0..1) pick which part of the photo shows.
  function fitPlacement(img, rect, zoom, cx, cy) {
    var base = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight);
    var scale = base * zoom;
    var dw = img.naturalWidth * scale;
    var dh = img.naturalHeight * scale;
    var px = rect.x + rect.w / 2 - cx * dw;
    var py = rect.y + rect.h / 2 - cy * dh;
    return { x: px, y: py, w: dw, h: dh };
  }

  function clampPlacement(rect, place, cx, cy) {
    var minCx = place.w > rect.w ? rect.w / (2 * place.w) : 0.5;
    var maxCx = place.w > rect.w ? 1 - rect.w / (2 * place.w) : 0.5;
    var minCy = place.h > rect.h ? rect.h / (2 * place.h) : 0.5;
    var maxCy = place.h > rect.h ? 1 - rect.h / (2 * place.h) : 0.5;
    return {
      cx: Math.min(maxCx, Math.max(minCx, cx)),
      cy: Math.min(maxCy, Math.max(minCy, cy)),
    };
  }

  // Base photo filter per grade, applied while the photo is drawn.
  function gradeFilter(gradeId) {
    if (gradeId === 'sunset') return 'saturate(1.42) contrast(1.12) brightness(1.03)';
    if (gradeId === 'neon') return 'saturate(1.85) contrast(1.18) brightness(1.02)';
    if (gradeId === 'noir') return 'grayscale(1) contrast(1.32) brightness(1.06)';
    return 'saturate(1.12) contrast(1.04)';
  }

  function gradeStops(gradeId) {
    if (gradeId === 'sunset') return ['#ff7a18', '#ff2e88', '#7b2ff7'];
    if (gradeId === 'neon') return ['#ff00c8', '#7b2ff7', '#00e5ff'];
    if (gradeId === 'noir') return ['#3a3a44', '#8a8a96', '#c9c9d4'];
    return ['#ffb36b', '#ff8a5c', '#ffd9a0'];
  }

  function accentColor(gradeId) {
    if (gradeId === 'neon') return '#00e5ff';
    if (gradeId === 'noir') return '#ffffff';
    if (gradeId === 'original') return '#ff7a18';
    return '#ff2e88';
  }

  // Gradient across the title glyphs themselves: white at the cap height
  // warming into the grade's lead colour at the baseline.
  function titleGradient(ctx, topY, bottomY, gradeId) {
    var grad = ctx.createLinearGradient(0, topY, 0, bottomY);
    var stops = gradeStops(gradeId);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, stops[0]);
    grad.addColorStop(1, stops[1]);
    return grad;
  }

  // Deterministic film grain: a small noise tile made once, tiled over the cover.
  var grainTile = null;
  function makeGrainTile() {
    if (grainTile) return grainTile;
    var size = 160;
    var tile = document.createElement('canvas');
    tile.width = size;
    tile.height = size;
    var tctx = tile.getContext('2d');
    var img = tctx.createImageData(size, size);
    var seed = 1337;
    function rnd() {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    for (var i = 0; i < img.data.length; i += 4) {
      var v = Math.floor(rnd() * 255);
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    tctx.putImageData(img, 0, 0);
    grainTile = tile;
    return tile;
  }

  function drawPanelPhoto(ctx, panel, img, placement) {
    ctx.save();
    if (panel.points) {
      ctx.beginPath();
      ctx.moveTo(panel.points[0][0], panel.points[0][1]);
      for (var i = 1; i < panel.points.length; i++) ctx.lineTo(panel.points[i][0], panel.points[i][1]);
      ctx.closePath();
      ctx.clip();
    } else {
      ctx.beginPath();
      ctx.rect(panel.x, panel.y, panel.w, panel.h);
      ctx.clip();
    }
    var place = fitPlacement(img, panel, placement.zoom, placement.cx, placement.cy);
    ctx.drawImage(img, place.x, place.y, place.w, place.h);
    ctx.restore();
  }

  function drawPhotoPlaceholder(ctx, panel, gradeId) {
    var stops = gradeStops(gradeId);
    var grad = ctx.createLinearGradient(panel.x, panel.y, panel.x + panel.w, panel.y + panel.h);
    grad.addColorStop(0, stops[0]);
    grad.addColorStop(1, stops[2]);
    ctx.save();
    ctx.fillStyle = grad;
    if (panel.points) {
      ctx.beginPath();
      ctx.moveTo(panel.points[0][0], panel.points[0][1]);
      for (var i = 1; i < panel.points.length; i++) ctx.lineTo(panel.points[i][0], panel.points[i][1]);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
    }
    ctx.restore();
  }

  // Colour grade: tinted gradient overlays, vignette and grain, over the photos.
  function applyGrade(ctx, W, H, gradeId) {
    var stops = gradeStops(gradeId);
    ctx.save();
    var tint = ctx.createLinearGradient(0, 0, W, H);
    tint.addColorStop(0, stops[0]);
    tint.addColorStop(0.5, stops[1]);
    tint.addColorStop(1, stops[2]);
    ctx.globalCompositeOperation = gradeId === 'noir' ? 'soft-light' : 'overlay';
    ctx.globalAlpha = gradeId === 'original' ? 0.22 : gradeId === 'noir' ? 0.25 : 0.5;
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, W, H);

    if (gradeId === 'sunset') {
      var warm = ctx.createLinearGradient(0, H * 0.4, 0, H);
      warm.addColorStop(0, 'rgba(255, 90, 40, 0)');
      warm.addColorStop(1, 'rgba(255, 90, 40, 0.28)');
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = 1;
      ctx.fillStyle = warm;
      ctx.fillRect(0, 0, W, H);
    }
    if (gradeId === 'neon') {
      var glow = ctx.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, W * 0.55);
      glow.addColorStop(0, 'rgba(255, 0, 200, 0.30)');
      glow.addColorStop(1, 'rgba(255, 0, 200, 0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 1;
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
    }

    // Vignette: darkened corners pull the eye to the middle of the poster.
    var vig = ctx.createRadialGradient(
      W / 2, H / 2, Math.min(W, H) * 0.42,
      W / 2, H / 2, Math.max(W, H) * 0.75
    );
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, gradeId === 'noir' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.34)');
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // Grain.
    var tile = makeGrainTile();
    var pattern = ctx.createPattern(tile, 'repeat');
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function tracked(text) {
    return text.split('').join(' ');
  }

  function outlinedText(ctx, text, x, y, font, fill, strokeWidth) {
    ctx.font = font;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = INK;
    ctx.lineWidth = strokeWidth;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  // Big condensed caption: subtitle above the title, footer at the foot.
  // Slight -2deg tilt, black outline, drop shadow, overlapping the panels.
  function drawCaption(ctx, W, H, state) {
    var title = (state.title || '').toUpperCase();
    var subtitle = (state.subtitle || '').toUpperCase();
    var footer = state.footer || '';
    if (!title && !subtitle && !footer) return;

    var titleSize = Math.round(W * 0.13);
    var fontStack = '"Anton", "Arial Black", sans-serif';
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // Shrink the title until it fits the cover width.
    ctx.font = titleSize + 'px ' + fontStack;
    var maxW = W * 0.92;
    var tw = ctx.measureText(title).width;
    if (tw > maxW) titleSize = Math.max(24, Math.floor(titleSize * maxW / tw));

    var x = Math.round(W * 0.045);
    var titleY = Math.round(H * 0.905);
    var subSize = Math.max(18, Math.round(titleSize * 0.3));
    var subY = titleY - Math.round(titleSize * 1.04);

    ctx.translate(x, titleY);
    ctx.rotate(-2 * Math.PI / 180);
    ctx.translate(-x, -titleY);

    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = Math.round(titleSize * 0.07);
    ctx.shadowOffsetX = Math.round(titleSize * 0.02);
    ctx.shadowOffsetY = Math.round(titleSize * 0.035);

    if (subtitle) {
      outlinedText(
        ctx, tracked(subtitle), x + Math.round(titleSize * 0.06), subY,
        subSize + 'px ' + fontStack, accentColor(state.grade), Math.max(3, subSize * 0.14)
      );
    }
    if (title) {
      outlinedText(
        ctx, title, x, titleY,
        titleSize + 'px ' + fontStack,
        titleGradient(ctx, titleY - titleSize, titleY + Math.round(titleSize * 0.12), state.grade),
        Math.max(4, titleSize * 0.07)
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
      ctx.fillText(footer.toUpperCase(), Math.round(W * 0.955), Math.round(H * 0.968));
      ctx.restore();
    }
  }

  function drawSelection(ctx, panels, selected) {
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
    var label = 'PANEL ' + (selected + 1);
    var lw = ctx.measureText(label).width + 18;
    ctx.fillRect(p.x + 6, p.y + 6, lw, 26);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, p.x + 15, p.y + 24);
    ctx.restore();
  }

  // Main entry: draws the whole cover onto canvas at its own pixel size.
  // state: { layout, grade, title, subtitle, footer, panels: [{photo, zoom, cx, cy}] }
  // photos: array of HTMLImageElement (or null for an empty slot).
  // options: { selected, showSelection }
  function renderCover(canvas, state, photos, options) {
    var opts = options || {};
    var W = canvas.width;
    var H = canvas.height;
    var ctx = canvas.getContext('2d');
    var layout = layoutPanels(state.layout, W, H);
    var panels = layout.panels;

    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = GUTTER_COLOR;
    ctx.fillRect(0, 0, W, H);

    ctx.filter = gradeFilter(state.grade);
    for (var i = 0; i < panels.length; i++) {
      var placement = (state.panels && state.panels[i]) || { photo: 0, zoom: 1, cx: 0.5, cy: 0.5 };
      var img = photos ? photos[placement.photo] : null;
      if (img && img.naturalWidth > 0) {
        // Clamp the pan at draw time: a stored cx/cy that fits one cover size
        // can leave a bare strip at another size, so never draw it uncovered.
        var probe = fitPlacement(img, panels[i], placement.zoom, placement.cx, placement.cy);
        var clamped = clampPlacement(panels[i], probe, placement.cx, placement.cy);
        drawPanelPhoto(ctx, panels[i], img, {
          zoom: placement.zoom,
          cx: clamped.cx,
          cy: clamped.cy,
        });
      } else {
        drawPhotoPlaceholder(ctx, panels[i], state.grade);
      }
    }
    ctx.filter = 'none';

    // Diagonal gutter stripe for the slash layout.
    if (state.layout === 'slash') {
      ctx.strokeStyle = GUTTER_COLOR;
      ctx.lineWidth = layout.gutter * 1.6;
      ctx.beginPath();
      ctx.moveTo(Math.round(W * 0.66), 0);
      ctx.lineTo(Math.round(W * 0.34), H);
      ctx.stroke();
    }

    applyGrade(ctx, W, H, state.grade);
    drawCaption(ctx, W, H, state);
    if (opts.showSelection) drawSelection(ctx, panels, opts.selected);
    ctx.restore();
    return layout;
  }

  // Renders the same cover onto a fresh canvas at export size.
  function exportCover(state, photos, w, h) {
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    renderCover(canvas, state, photos, {});
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

  function loadFont() {
    if (document.fonts && document.fonts.load) {
      return document.fonts.load('100px "Anton"').catch(function () {});
    }
    return Promise.resolve();
  }

  window.ViceCover = {
    LAYOUTS: LAYOUTS,
    GRADES: GRADES,
    SIZES: SIZES,
    layoutPanels: layoutPanels,
    fitPlacement: fitPlacement,
    clampPlacement: clampPlacement,
    renderCover: renderCover,
    exportCover: exportCover,
    loadImage: loadImage,
    loadFont: loadFont,
  };
})();
