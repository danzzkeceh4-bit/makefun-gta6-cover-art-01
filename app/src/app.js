// Vice Cover Studio — editor logic.
//
// Wires the preview canvas to the controls: picking layouts and grades,
// editing the caption, uploading photos, dragging and zooming each panel,
// and exporting the PNG. It also powers the deterministic ?shot= scenes
// the screenshots are taken from. Classic script; the renderer lives in
// window.CoverArt.

(function () {
  'use strict';

  var Art = window.CoverArt;

  var params = new URLSearchParams(window.location.search);
  var shotMode = params.get('shot') || 'editor';

  // The cover being edited. panels[i] places a photo: zoom 1 is the
  // tightest cover-fit, fx/fy (0..1) pan the crop inside the panel.
  var cover = {
    layout: 'trio',
    grade: 'sunset',
    size: 'landscape',
    title: 'VICE CITY',
    subtitle: 'NEON NIGHTS',
    footer: 'A STORY FROM VICE CITY',
    panels: [
      { photo: 0, zoom: 1.0, fx: 0.5, fy: 0.42 },
      { photo: 1, zoom: 1.0, fx: 0.5, fy: 0.5 },
      { photo: 0, zoom: 1.25, fx: 0.68, fy: 0.5 },
      { photo: 1, zoom: 1.15, fx: 0.35, fy: 0.5 },
    ],
  };
  var selectedPanel = 0;
  var photos = [];
  var drawPending = false;

  var preview = document.getElementById('previewCanvas');
  var coverCanvas = document.getElementById('coverCanvas');
  var hint = document.getElementById('panelHint');
  var zoomRange = document.getElementById('zoomSlider');
  var sizeBadge = document.getElementById('sizeLabel');
  var strip = document.getElementById('photoStrip');
  var countLabel = document.getElementById('photoCount');

  function slotCount() {
    for (var i = 0; i < Art.LAYOUTS.length; i++) {
      if (Art.LAYOUTS[i].id === cover.layout) return Art.LAYOUTS[i].panels;
    }
    return 1;
  }

  function currentPanels() {
    return Art.panelGeometry(cover.layout, preview.width, preview.height).panels;
  }

  function queueDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () {
      drawPending = false;
      drawPreview();
    });
  }

  function drawPreview() {
    var size = Art.SIZES[cover.size];
    if (preview.width !== size.w || preview.height !== size.h) {
      preview.width = size.w;
      preview.height = size.h;
    }
    Art.drawCover(preview, cover, photos, { selected: selectedPanel, showSelection: true });
    refreshHint();
  }

  function refreshHint() {
    var n = slotCount();
    if (selectedPanel >= n) selectedPanel = n - 1;
    hint.textContent =
      'Panel ' + (selectedPanel + 1) + ' of ' + n + ' — drag to move, scroll to zoom';
    zoomRange.value = String(Math.round((cover.panels[selectedPanel].zoom || 1) * 100));
  }

  function rebuildStrip() {
    strip.innerHTML = '';
    photos.forEach(function (img, idx) {
      var thumb = document.createElement('img');
      thumb.src = img.src;
      thumb.alt = 'Photo ' + (idx + 1);
      var classes = [];
      if (cover.panels[selectedPanel] && cover.panels[selectedPanel].photo === idx) classes.push('selected');
      if (cover.panels.some(function (p) { return p.photo === idx; })) classes.push('assigned');
      thumb.className = classes.join(' ');
      thumb.addEventListener('click', function () {
        cover.panels[selectedPanel].photo = idx;
        queueDraw();
        rebuildStrip();
      });
      strip.appendChild(thumb);
    });
    countLabel.textContent = photos.length + (photos.length === 1 ? ' photo loaded' : ' photos loaded');
  }

  function choiceButtons(gridId, items, activeId, onPick) {
    var grid = document.getElementById(gridId);
    grid.innerHTML = '';
    items.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn' + (activeId() === item.id ? ' active' : '');
      btn.textContent = item.label;
      btn.addEventListener('click', function () {
        onPick(item.id);
        Array.prototype.forEach.call(grid.children, function (child) {
          child.classList.remove('active');
        });
        btn.classList.add('active');
      });
      grid.appendChild(btn);
    });
  }

  function buildPickers() {
    choiceButtons('layoutGrid', Art.LAYOUTS, function () { return cover.layout; }, function (id) {
      cover.layout = id;
      if (selectedPanel >= slotCount()) selectedPanel = slotCount() - 1;
      queueDraw();
    });
    choiceButtons('gradeGrid', Art.GRADES, function () { return cover.grade; }, function (id) {
      cover.grade = id;
      queueDraw();
    });
    var sizeItems = Object.keys(Art.SIZES).map(function (id) {
      return { id: id, label: Art.SIZES[id].label };
    });
    choiceButtons('sizeGrid', sizeItems, function () { return cover.size; }, function (id) {
      cover.size = id;
      sizeBadge.textContent = Art.SIZES[id].label;
      queueDraw();
    });
  }

  function bindCaption() {
    var titleEl = document.getElementById('titleInput');
    var subEl = document.getElementById('subtitleInput');
    var footEl = document.getElementById('footerInput');
    titleEl.addEventListener('input', function () { cover.title = titleEl.value; queueDraw(); });
    subEl.addEventListener('input', function () { cover.subtitle = subEl.value; queueDraw(); });
    footEl.addEventListener('input', function () { cover.footer = footEl.value; queueDraw(); });
  }

  function bindPanelTools() {
    zoomRange.addEventListener('input', function () {
      cover.panels[selectedPanel].zoom = Number(zoomRange.value) / 100;
      queueDraw();
    });
    document.getElementById('fillBtn').addEventListener('click', function () {
      var slot = cover.panels[selectedPanel];
      slot.zoom = 1;
      slot.fx = 0.5;
      slot.fy = 0.5;
      queueDraw();
    });
    document.getElementById('swapBtn').addEventListener('click', function () {
      if (!photos.length) return;
      var slot = cover.panels[selectedPanel];
      slot.photo = (slot.photo + 1) % photos.length;
      queueDraw();
      rebuildStrip();
    });
    // Arrow keys nudge the selected panel's crop; Shift moves it further.
    document.addEventListener('keydown', function (event) {
      if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) return;
      var step = event.shiftKey ? 0.08 : 0.025;
      var slot = cover.panels[selectedPanel];
      if (event.key === 'ArrowLeft') slot.fx += step;
      else if (event.key === 'ArrowRight') slot.fx -= step;
      else if (event.key === 'ArrowUp') slot.fy += step;
      else if (event.key === 'ArrowDown') slot.fy -= step;
      else return;
      event.preventDefault();
      var panel = currentPanels()[selectedPanel];
      var img = photos[slot.photo];
      if (img) {
        var probe = Art.coverFit(img, panel, slot.zoom, slot.fx, slot.fy);
        var clamped = Art.clampPan(panel, probe, slot.fx, slot.fy);
        slot.fx = clamped.fx;
        slot.fy = clamped.fy;
      }
      queueDraw();
    });
  }

  function toCanvasPoint(event) {
    var box = preview.getBoundingClientRect();
    return {
      x: (event.clientX - box.left) * (preview.width / box.width),
      y: (event.clientY - box.top) * (preview.height / box.height),
    };
  }

  function panelAt(point) {
    var panels = currentPanels();
    for (var i = panels.length - 1; i >= 0; i--) {
      var p = panels[i];
      if (point.x >= p.x && point.x <= p.x + p.w && point.y >= p.y && point.y <= p.y + p.h) return i;
    }
    return -1;
  }

  function bindGestures() {
    var dragging = false;
    var lastPoint = null;
    var lastDrawn = null;

    preview.addEventListener('pointerdown', function (event) {
      var point = toCanvasPoint(event);
      var hit = panelAt(point);
      if (hit < 0) return;
      selectedPanel = hit;
      var panel = currentPanels()[hit];
      var img = photos[cover.panels[hit].photo];
      lastDrawn = img
        ? Art.coverFit(img, panel, cover.panels[hit].zoom, cover.panels[hit].fx, cover.panels[hit].fy)
        : null;
      dragging = true;
      lastPoint = point;
      preview.setPointerCapture(event.pointerId);
      queueDraw();
      rebuildStrip();
    });

    preview.addEventListener('pointermove', function (event) {
      if (!dragging || !lastPoint) return;
      var point = toCanvasPoint(event);
      var dx = point.x - lastPoint.x;
      var dy = point.y - lastPoint.y;
      var panel = currentPanels()[selectedPanel];
      var slot = cover.panels[selectedPanel];
      if (lastDrawn) {
        var clamped = Art.clampPan(
          panel, lastDrawn,
          slot.fx - dx / lastDrawn.w,
          slot.fy - dy / lastDrawn.h
        );
        slot.fx = clamped.fx;
        slot.fy = clamped.fy;
      }
      lastPoint = point;
      var img = photos[slot.photo];
      lastDrawn = img ? Art.coverFit(img, panel, slot.zoom, slot.fx, slot.fy) : null;
      queueDraw();
    });

    function endDrag() {
      dragging = false;
      lastPoint = null;
      lastDrawn = null;
    }
    preview.addEventListener('pointerup', endDrag);
    preview.addEventListener('pointercancel', endDrag);

    preview.addEventListener('wheel', function (event) {
      event.preventDefault();
      var point = toCanvasPoint(event);
      var hit = panelAt(point);
      if (hit < 0) return;
      selectedPanel = hit;
      var slot = cover.panels[hit];
      slot.zoom = Math.min(3, Math.max(1, slot.zoom * Math.exp(-event.deltaY * 0.0012)));
      var panel = currentPanels()[hit];
      var img = photos[slot.photo];
      if (img) {
        var probe = Art.coverFit(img, panel, slot.zoom, slot.fx, slot.fy);
        var clamped = Art.clampPan(panel, probe, slot.fx, slot.fy);
        slot.fx = clamped.fx;
        slot.fy = clamped.fy;
      }
      queueDraw();
    }, { passive: false });
  }

  function addFile(file) {
    if (!file || file.type.indexOf('image/') !== 0) return Promise.resolve(false);
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function () {
        Art.loadImage(String(reader.result)).then(function (img) {
          photos.push(img);
          document.getElementById('dropHint').style.display = 'none';
          rebuildStrip();
          queueDraw();
          resolve(true);
        }).catch(function () { resolve(false); });
      };
      reader.onerror = function () { resolve(false); };
      reader.readAsDataURL(file);
    });
  }

  function bindUploads() {
    var fileInput = document.getElementById('fileInput');
    document.getElementById('pickBtn').addEventListener('click', function () {
      fileInput.click();
    });
    fileInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(fileInput.files || []);
      var chain = Promise.resolve();
      files.forEach(function (file) {
        chain = chain.then(function () { return addFile(file); });
      });
      fileInput.value = '';
    });

    var dropZone = document.getElementById('dropZone');
    dropZone.addEventListener('dragover', function (event) {
      event.preventDefault();
      dropZone.classList.add('dragging');
    });
    dropZone.addEventListener('dragleave', function () {
      dropZone.classList.remove('dragging');
    });
    dropZone.addEventListener('drop', function (event) {
      event.preventDefault();
      dropZone.classList.remove('dragging');
      var files = Array.prototype.slice.call(event.dataTransfer.files || []);
      var chain = Promise.resolve();
      files.forEach(function (file) {
        chain = chain.then(function () { return addFile(file); });
      });
    });
  }

  function downloadPng() {
    var size = Art.SIZES[cover.size];
    var canvas = Art.exportCover(cover, photos, size.w, size.h);
    canvas.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'vice-cover-' + size.w + 'x' + size.h + '.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    }, 'image/png');
  }

  function bindExport() {
    document.getElementById('exportBtn').addEventListener('click', downloadPng);
    document.getElementById('exportBtn2').addEventListener('click', downloadPng);
  }

  function applyShotQuery() {
    if (params.get('layout')) cover.layout = params.get('layout');
    if (params.get('grade')) cover.grade = params.get('grade');
    if (params.get('size')) cover.size = params.get('size');
    if (params.get('title') !== null) cover.title = params.get('title');
    if (params.get('subtitle') !== null) cover.subtitle = params.get('subtitle');
    if (params.get('footer') !== null) cover.footer = params.get('footer');
  }

  function loadSamples() {
    return Promise.all([
      Art.loadImage('samples/boulevard.jpg'),
      Art.loadImage('samples/pier.jpg'),
    ]).then(function (loaded) {
      photos = loaded;
    }).catch(function () {
      photos = [];
    });
  }

  function runSelftest() {
    var canvas = Art.exportCover(cover, photos, 1080, 1080);
    canvas.toBlob(function (blob) {
      var box = document.getElementById('selftest');
      box.hidden = false;
      box.textContent = blob ? 'SELFTEST OK ' + blob.size : 'SELFTEST FAILED';
      window.__shotReady = true;
    }, 'image/png');
  }

  function startEditor() {
    document.getElementById('editorView').hidden = false;
    document.getElementById('coverView').hidden = true;
    buildPickers();
    bindCaption();
    bindPanelTools();
    bindGestures();
    bindUploads();
    bindExport();
    sizeBadge.textContent = Art.SIZES[cover.size].label;
    Art.loadAnton().then(function () { return loadSamples(); }).then(function () {
      rebuildStrip();
      drawPreview();
      if (params.get('selftest') === '1') runSelftest();
      window.__shotReady = true;
    });
  }

  function startCoverShot() {
    document.getElementById('editorView').hidden = true;
    document.querySelector('.masthead').style.display = 'none';
    document.getElementById('coverView').hidden = false;
    document.body.classList.add('shot-cover');
    applyShotQuery();
    var size = Art.SIZES[cover.size] || Art.SIZES.landscape;
    coverCanvas.width = size.w;
    coverCanvas.height = size.h;
    Art.loadAnton().then(function () { return loadSamples(); }).then(function () {
      Art.drawCover(coverCanvas, cover, photos, {});
      if (params.get('selftest') === '1') runSelftest();
      window.__shotReady = true;
    });
  }

  if (shotMode === 'cover') startCoverShot();
  else startEditor();
})();
