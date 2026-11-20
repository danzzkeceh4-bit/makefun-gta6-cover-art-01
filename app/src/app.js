// Vice Cover Studio — editor logic.
// Wires the preview canvas, the controls, uploads, panel dragging and the
// PNG export, plus the deterministic ?shot= / ?selftest= scenes used for
// screenshots. Classic script; the renderer lives in window.ViceCover.

(function () {
  'use strict';

  var VC = window.ViceCover;

  var query = new URLSearchParams(window.location.search);
  var shot = query.get('shot') || 'editor';

  // Editor state. panels[i] places photo i: zoom 1 fills, cx/cy pan the crop.
  var state = {
    layout: 'trio',
    grade: 'sunset',
    size: 'landscape',
    title: 'VICE CITY',
    subtitle: 'NEON NIGHTS',
    footer: 'A STORY FROM VICE CITY',
    panels: [
      { photo: 0, zoom: 1.0, cx: 0.5, cy: 0.42 },
      { photo: 1, zoom: 1.0, cx: 0.5, cy: 0.5 },
      { photo: 0, zoom: 1.25, cx: 0.68, cy: 0.5 },
      { photo: 1, zoom: 1.15, cx: 0.35, cy: 0.5 },
    ],
  };
  var selected = 0;
  var photos = [];
  var renderQueued = false;

  var previewCanvas = document.getElementById('previewCanvas');
  var coverCanvas = document.getElementById('coverCanvas');
  var panelHint = document.getElementById('panelHint');
  var zoomSlider = document.getElementById('zoomSlider');
  var sizeLabel = document.getElementById('sizeLabel');
  var photoStrip = document.getElementById('photoStrip');
  var photoCount = document.getElementById('photoCount');

  function panelCount() {
    for (var i = 0; i < VC.LAYOUTS.length; i++) {
      if (VC.LAYOUTS[i].id === state.layout) return VC.LAYOUTS[i].panels;
    }
    return 1;
  }

  function currentPanels() {
    return VC.layoutPanels(state.layout, previewCanvas.width, previewCanvas.height).panels;
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(function () {
      renderQueued = false;
      renderPreview();
    });
  }

  function renderPreview() {
    var size = VC.SIZES[state.size];
    if (previewCanvas.width !== size.w || previewCanvas.height !== size.h) {
      previewCanvas.width = size.w;
      previewCanvas.height = size.h;
    }
    VC.renderCover(previewCanvas, state, photos, { selected: selected, showSelection: true });
    updatePanelHint();
  }

  function updatePanelHint() {
    var n = panelCount();
    if (selected >= n) selected = n - 1;
    panelHint.textContent =
      'Panel ' + (selected + 1) + ' of ' + n + ' — drag to move, scroll to zoom';
    zoomSlider.value = String(Math.round((state.panels[selected].zoom || 1) * 100));
  }

  function refreshStrip() {
    photoStrip.innerHTML = '';
    photos.forEach(function (img, idx) {
      var thumb = document.createElement('img');
      thumb.src = img.src;
      thumb.alt = 'Photo ' + (idx + 1);
      thumb.className =
        (state.panels[selected] && state.panels[selected].photo === idx ? 'selected ' : '') +
        (state.panels.some(function (p) { return p.photo === idx; }) ? 'assigned' : '');
      thumb.addEventListener('click', function () {
        state.panels[selected].photo = idx;
        scheduleRender();
        refreshStrip();
      });
      photoStrip.appendChild(thumb);
    });
    photoCount.textContent = photos.length + (photos.length === 1 ? ' photo loaded' : ' photos loaded');
  }

  function buildChoiceButtons(containerId, items, getActive, onPick) {
    var grid = document.getElementById(containerId);
    grid.innerHTML = '';
    items.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn' + (getActive() === item.id ? ' active' : '');
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

  function buildControls() {
    buildChoiceButtons('layoutGrid', VC.LAYOUTS, function () { return state.layout; }, function (id) {
      state.layout = id;
      if (selected >= panelCount()) selected = panelCount() - 1;
      scheduleRender();
    });
    buildChoiceButtons('gradeGrid', VC.GRADES, function () { return state.grade; }, function (id) {
      state.grade = id;
      scheduleRender();
    });
    var sizeItems = Object.keys(VC.SIZES).map(function (id) {
      return { id: id, label: VC.SIZES[id].label };
    });
    buildChoiceButtons('sizeGrid', sizeItems, function () { return state.size; }, function (id) {
      state.size = id;
      sizeLabel.textContent = VC.SIZES[id].label;
      scheduleRender();
    });
  }

  function bindCaptionInputs() {
    var titleInput = document.getElementById('titleInput');
    var subtitleInput = document.getElementById('subtitleInput');
    var footerInput = document.getElementById('footerInput');
    titleInput.addEventListener('input', function () { state.title = titleInput.value; scheduleRender(); });
    subtitleInput.addEventListener('input', function () { state.subtitle = subtitleInput.value; scheduleRender(); });
    footerInput.addEventListener('input', function () { state.footer = footerInput.value; scheduleRender(); });
  }

  function bindPanelControls() {
    zoomSlider.addEventListener('input', function () {
      state.panels[selected].zoom = Number(zoomSlider.value) / 100;
      scheduleRender();
    });
    document.getElementById('fillBtn').addEventListener('click', function () {
      state.panels[selected].zoom = 1;
      state.panels[selected].cx = 0.5;
      state.panels[selected].cy = 0.5;
      scheduleRender();
    });
    document.getElementById('swapBtn').addEventListener('click', function () {
      if (!photos.length) return;
      var p = state.panels[selected];
      p.photo = (p.photo + 1) % photos.length;
      scheduleRender();
      refreshStrip();
    });
    // Arrow keys nudge the selected panel's crop; Shift moves it further.
    document.addEventListener('keydown', function (event) {
      if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) return;
      var step = event.shiftKey ? 0.08 : 0.025;
      var placement = state.panels[selected];
      if (event.key === 'ArrowLeft') placement.cx += step;
      else if (event.key === 'ArrowRight') placement.cx -= step;
      else if (event.key === 'ArrowUp') placement.cy += step;
      else if (event.key === 'ArrowDown') placement.cy -= step;
      else return;
      event.preventDefault();
      var panel = currentPanels()[selected];
      var img = photos[placement.photo];
      if (img) {
        var place = VC.fitPlacement(img, panel, placement.zoom, placement.cx, placement.cy);
        var clamped = VC.clampPlacement(panel, place, placement.cx, placement.cy);
        placement.cx = clamped.cx;
        placement.cy = clamped.cy;
      }
      scheduleRender();
    });
  }

  function canvasPoint(event) {
    var rect = previewCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (previewCanvas.width / rect.width),
      y: (event.clientY - rect.top) * (previewCanvas.height / rect.height),
    };
  }

  function hitPanel(point) {
    var panels = currentPanels();
    for (var i = panels.length - 1; i >= 0; i--) {
      var p = panels[i];
      if (point.x >= p.x && point.x <= p.x + p.w && point.y >= p.y && point.y <= p.y + p.h) return i;
    }
    return -1;
  }

  function bindCanvasGestures() {
    var dragging = false;
    var dragStart = null;
    var dragPlacement = null;

    previewCanvas.addEventListener('pointerdown', function (event) {
      var point = canvasPoint(event);
      var hit = hitPanel(point);
      if (hit < 0) return;
      selected = hit;
      var panel = currentPanels()[hit];
      var img = photos[state.panels[hit].photo];
      dragPlacement = img
        ? VC.fitPlacement(img, panel, state.panels[hit].zoom, state.panels[hit].cx, state.panels[hit].cy)
        : null;
      dragging = true;
      dragStart = point;
      previewCanvas.setPointerCapture(event.pointerId);
      scheduleRender();
      refreshStrip();
    });

    previewCanvas.addEventListener('pointermove', function (event) {
      if (!dragging || !dragStart) return;
      var point = canvasPoint(event);
      var dx = point.x - dragStart.x;
      var dy = point.y - dragStart.y;
      var panel = currentPanels()[selected];
      var placement = state.panels[selected];
      if (dragPlacement) {
        var clamped = VC.clampPlacement(
          panel, dragPlacement,
          placement.cx - dx / dragPlacement.w,
          placement.cy - dy / dragPlacement.h
        );
        placement.cx = clamped.cx;
        placement.cy = clamped.cy;
      }
      dragStart = point;
      dragPlacement = null;
      var img = photos[placement.photo];
      if (img) {
        dragPlacement = VC.fitPlacement(img, panel, placement.zoom, placement.cx, placement.cy);
      }
      scheduleRender();
    });

    function endDrag() {
      dragging = false;
      dragStart = null;
      dragPlacement = null;
    }
    previewCanvas.addEventListener('pointerup', endDrag);
    previewCanvas.addEventListener('pointercancel', endDrag);

    previewCanvas.addEventListener('wheel', function (event) {
      event.preventDefault();
      var point = canvasPoint(event);
      var hit = hitPanel(point);
      if (hit < 0) return;
      selected = hit;
      var placement = state.panels[hit];
      placement.zoom = Math.min(3, Math.max(1, placement.zoom * Math.exp(-event.deltaY * 0.0012)));
      var panel = currentPanels()[hit];
      var img = photos[placement.photo];
      if (img) {
        var place = VC.fitPlacement(img, panel, placement.zoom, placement.cx, placement.cy);
        var clamped = VC.clampPlacement(panel, place, placement.cx, placement.cy);
        placement.cx = clamped.cx;
        placement.cy = clamped.cy;
      }
      scheduleRender();
    }, { passive: false });
  }

  function addPhotoFile(file) {
    if (!file || file.type.indexOf('image/') !== 0) return Promise.resolve(false);
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function () {
        VC.loadImage(String(reader.result)).then(function (img) {
          photos.push(img);
          // Once the user brings their own photo, the drop hint has done its job.
          document.getElementById('dropHint').style.display = 'none';
          refreshStrip();
          scheduleRender();
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
        chain = chain.then(function () { return addPhotoFile(file); });
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
        chain = chain.then(function () { return addPhotoFile(file); });
      });
    });
  }

  function exportPng() {
    var size = VC.SIZES[state.size];
    var canvas = VC.exportCover(state, photos, size.w, size.h);
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
    document.getElementById('exportBtn').addEventListener('click', exportPng);
    document.getElementById('exportBtn2').addEventListener('click', exportPng);
  }

  function applyShotParams() {
    if (query.get('layout')) state.layout = query.get('layout');
    if (query.get('grade')) state.grade = query.get('grade');
    if (query.get('size')) state.size = query.get('size');
    if (query.get('title') !== null) state.title = query.get('title');
    if (query.get('subtitle') !== null) state.subtitle = query.get('subtitle');
    if (query.get('footer') !== null) state.footer = query.get('footer');
  }

  function loadSamples() {
    return Promise.all([
      VC.loadImage('samples/boulevard.jpg'),
      VC.loadImage('samples/pier.jpg'),
    ]).then(function (loaded) {
      photos = loaded;
    }).catch(function () {
      photos = [];
    });
  }

  function runSelftest() {
    var canvas = VC.exportCover(state, photos, 1080, 1080);
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
    buildControls();
    bindCaptionInputs();
    bindPanelControls();
    bindCanvasGestures();
    bindUploads();
    bindExport();
    sizeLabel.textContent = VC.SIZES[state.size].label;
    VC.loadFont().then(function () { return loadSamples(); }).then(function () {
      refreshStrip();
      renderPreview();
      if (query.get('selftest') === '1') runSelftest();
      window.__shotReady = true;
    });
  }

  function startCoverShot() {
    document.getElementById('editorView').hidden = true;
    document.querySelector('.topbar').style.display = 'none';
    document.getElementById('coverView').hidden = false;
    document.body.classList.add('shot-cover');
    applyShotParams();
    var size = VC.SIZES[state.size] || VC.SIZES.landscape;
    coverCanvas.width = size.w;
    coverCanvas.height = size.h;
    VC.loadFont().then(function () { return loadSamples(); }).then(function () {
      VC.renderCover(coverCanvas, state, photos, {});
      if (query.get('selftest') === '1') runSelftest();
      window.__shotReady = true;
    });
  }

  if (shot === 'cover') startCoverShot();
  else startEditor();
})();
