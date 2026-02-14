/**
 * ImageMaster Web – логика формата, превью, размытие, экспорт.
 * Адаптировано под Safari и iPhone 14 Pro.
 */

(function () {
  const formatSelect = document.getElementById('format');
  const customRatio = document.getElementById('custom-ratio');
  const ratioW = document.getElementById('ratio-w');
  const ratioH = document.getElementById('ratio-h');
  const segmented = document.querySelector('.segmented');
  const fileInput = document.getElementById('files');
  const fileCount = document.getElementById('file-count');
  const thumbs = document.getElementById('thumbs');
  const previewCanvas = document.getElementById('preview');
  const previewPlaceholder = document.getElementById('preview-placeholder');
  const startBtn = document.getElementById('start');
  const statusEl = document.getElementById('status');

  let files = [];
  let objectUrls = [];
  let previewIndex = 0;
  let bgMode = 'white';

  const PREVIEW_MAX = 600;

  function getTargetRatio() {
    const v = formatSelect.value;
    if (v !== 'custom') return parseFloat(v, 10);
    const w = parseFloat(ratioW.value.replace(',', '.'), 10);
    const h = parseFloat(ratioH.value.replace(',', '.'), 10);
    if (!Number.isFinite(w) || !Number.isFinite(h) || h <= 0) return null;
    return w / h;
  }

  function canvasSize(oldW, oldH, targetRatio) {
    const newW = Math.max(oldW, oldH * targetRatio);
    const newH = Math.max(oldH, oldW / targetRatio);
    return { width: Math.ceil(newW), height: Math.ceil(newH) };
  }

  function drawBlurredBackground(ctx, img, canvasW, canvasH) {
    // Базовый тон, чтобы не было «пустых» зон при нестандартных пропорциях
    const colorProbe = document.createElement('canvas');
    colorProbe.width = 1;
    colorProbe.height = 1;
    const probeCtx = colorProbe.getContext('2d', { willReadFrequently: true });
    probeCtx.drawImage(img, 0, 0, 1, 1);
    const pixel = probeCtx.getImageData(0, 0, 1, 1).data;
    ctx.fillStyle = 'rgb(' + pixel[0] + ', ' + pixel[1] + ', ' + pixel[2] + ')';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Вписываем исходник, чтобы оттенки расходились к краям равномерно со всех сторон
    const containScale = Math.min(canvasW / img.width, canvasH / img.height);
    const containW = Math.max(1, Math.round(img.width * containScale));
    const containH = Math.max(1, Math.round(img.height * containScale));
    const containX = (canvasW - containW) / 2;
    const containY = (canvasH - containH) / 2;

    const layer = document.createElement('canvas');
    layer.width = canvasW;
    layer.height = canvasH;
    const layerCtx = layer.getContext('2d');
    layerCtx.fillStyle = ctx.fillStyle;
    layerCtx.fillRect(0, 0, canvasW, canvasH);
    layerCtx.imageSmoothingEnabled = true;
    layerCtx.imageSmoothingQuality = 'high';
    layerCtx.drawImage(img, 0, 0, img.width, img.height, containX, containY, containW, containH);

    // Несколько проходов downscale/upscale дают мягкое и глубокое размытие
    const passes = [4, 8, 12];
    const work = document.createElement('canvas');
    work.width = canvasW;
    work.height = canvasH;
    const workCtx = work.getContext('2d');
    workCtx.drawImage(layer, 0, 0);

    passes.forEach(function (divisor) {
      const sw = Math.max(1, Math.floor(canvasW / divisor));
      const sh = Math.max(1, Math.floor(canvasH / divisor));
      const tiny = document.createElement('canvas');
      tiny.width = sw;
      tiny.height = sh;
      const tinyCtx = tiny.getContext('2d');
      tinyCtx.imageSmoothingEnabled = true;
      tinyCtx.imageSmoothingQuality = 'high';
      tinyCtx.drawImage(work, 0, 0, canvasW, canvasH, 0, 0, sw, sh);

      workCtx.clearRect(0, 0, canvasW, canvasH);
      workCtx.imageSmoothingEnabled = true;
      workCtx.imageSmoothingQuality = 'high';
      workCtx.drawImage(tiny, 0, 0, sw, sh, 0, 0, canvasW, canvasH);
    });

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(work, 0, 0, canvasW, canvasH);
  }

  function drawResult(sourceImage, targetRatio, bgMode, outputW, outputH) {
    const img = sourceImage;
    const oldW = img.naturalWidth || img.width;
    const oldH = img.naturalHeight || img.height;
    const { width: cw, height: ch } = canvasSize(oldW, oldH, targetRatio);
    const offsetX = (cw - oldW) / 2;
    const offsetY = (ch - oldH) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');

    if (bgMode === 'blur') {
      drawBlurredBackground(ctx, img, cw, ch);
    } else {
      ctx.fillStyle = bgMode === 'black' ? '#000' : '#fff';
      ctx.fillRect(0, 0, cw, ch);
    }
    ctx.drawImage(img, offsetX, offsetY, oldW, oldH);

    if (outputW && outputH && (outputW !== cw || outputH !== ch)) {
      const out = document.createElement('canvas');
      out.width = outputW;
      out.height = outputH;
      const outCtx = out.getContext('2d');
      outCtx.drawImage(canvas, 0, 0, cw, ch, 0, 0, outputW, outputH);
      return out;
    }
    return canvas;
  }

  function updatePreview() {
    var ratio = getTargetRatio();
    if (!ratio || !files.length) {
      previewCanvas.hidden = true;
      previewPlaceholder.hidden = false;
      return;
    }
    var idx = Math.min(previewIndex, files.length - 1);
    var file = files[idx];
    var img = file._img;
    if (!img || !img.complete) {
      previewCanvas.hidden = true;
      previewPlaceholder.hidden = false;
      return;
    }

    // Рисуем изображение в полном разрешении, затем уменьшаем с высоким качеством
    var baseCanvas = drawResult(img, ratio, bgMode);
    if (!baseCanvas) {
      previewCanvas.hidden = true;
      previewPlaceholder.hidden = false;
      return;
    }

    var maxW = PREVIEW_MAX;
    var maxH = 360;
    var scale = Math.min(maxW / baseCanvas.width, maxH / baseCanvas.height, 1);
    var outW = Math.round(baseCanvas.width * scale);
    var outH = Math.round(baseCanvas.height * scale);

    var ctx = previewCanvas.getContext('2d');
    previewCanvas.width = outW;
    previewCanvas.height = outH;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, outW, outH);
    ctx.drawImage(baseCanvas, 0, 0, baseCanvas.width, baseCanvas.height, 0, 0, outW, outH);

    previewCanvas.hidden = false;
    previewPlaceholder.hidden = true;
  }

  function setStatus(msg) {
    statusEl.textContent = msg;
  }

  function onFormatChange() {
    const isCustom = formatSelect.value === 'custom';
    customRatio.hidden = !isCustom;
    updatePreview();
  }

  function onBgClick(e) {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    segmented.querySelectorAll('.segmented-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    bgMode = btn.dataset.bg;
    updatePreview();
  }

  function loadFiles(fileList) {
    objectUrls.forEach((u) => URL.revokeObjectURL(u));
    objectUrls = [];

    const newFiles = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    files = newFiles;
    previewIndex = 0;
    fileCount.textContent = newFiles.length ? 'Выбрано: ' + newFiles.length : '';
    thumbs.innerHTML = '';

    newFiles.forEach((file, i) => {
      const url = URL.createObjectURL(file);
      objectUrls.push(url);

      const img = new Image();
      img.onload = function () {
        file._img = img;
        updatePreview();
      };
      img.src = url;

      const thumb = document.createElement('img');
      thumb.className = 'thumb' + (i === 0 ? ' active' : '');
      thumb.alt = file.name;
      thumb.src = url;
      thumb.dataset.index = String(i);
      thumb.addEventListener('click', function () {
        previewIndex = i;
        thumbs.querySelectorAll('.thumb').forEach(function (t) {
          t.classList.remove('active');
        });
        thumb.classList.add('active');
        updatePreview();
      });
      thumbs.appendChild(thumb);
    });

    updatePreview();
  }

  function isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  }

  function canShareFiles(filesArray) {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      return navigator.canShare({ files: filesArray });
    } catch (e) {
      return false;
    }
  }

  function processAll() {
    var ratio = getTargetRatio();
    if (!ratio) {
      setStatus('Укажите формат (для своего — оба поля).');
      return;
    }
    if (!files.length) {
      setStatus('Выберите изображения.');
      return;
    }

    startBtn.disabled = true;
    setStatus('Обработка всех фото…');
    var total = files.length;
    var results = [];
    var processed = 0;

    function tryNext(i) {
      if (i >= total) {
        finishProcess();
        return;
      }
      var file = files[i];
      var img = file._img;
      if (!img || !img.complete) {
        if (img) {
          img.onload = function () {
            runOne(i, tryNext);
          };
        } else {
          setTimeout(function () {
            tryNext(i);
          }, 50);
        }
        return;
      }
      runOne(i, tryNext);
    }

    function runOne(i, next) {
      var file = files[i];
      var img = file._img;
      if (!img) {
        setStatus('Обработано ' + (processed + 1) + ' из ' + total);
        next(i + 1);
        return;
      }
      var canvas = drawResult(img, ratio, bgMode);
      if (!canvas) {
        setStatus('Обработано ' + (processed + 1) + ' из ' + total);
        next(i + 1);
        return;
      }
      var base = file.name.replace(/\.[^.]+$/, '');
      var ext = file.name.match(/\.[^.]+$/);
      ext = ext ? ext[0] : '.jpg';
      var name = base + '_ratio' + canvas.width + 'x' + canvas.height + ext;

      canvas.toBlob(
        function (blob) {
          if (blob) {
            results.push(new File([blob], name, { type: 'image/jpeg' }));
            processed++;
          }
          setStatus('Обработано ' + processed + ' из ' + total);
          next(i + 1);
        },
        'image/jpeg',
        0.92
      );
    }

    function finishProcess() {
      if (results.length === 0) {
        startBtn.disabled = false;
        setStatus('Нет обработанных фото.');
        return;
      }
      setStatus('Сохранение…');

      if (isIOS() && canShareFiles(results)) {
        navigator.share({ files: results, title: 'ImageMaster' })
          .then(function () {
            setStatus('Все фото сохранены.');
          })
          .catch(function (err) {
            if (err.name === 'AbortError') {
              setStatus('Отменено.');
            } else {
              setStatus('Ошибка. Попробуйте снова.');
            }
          })
          .then(function () {
            startBtn.disabled = false;
          });
      } else {
        // Desktop или нет поддержки share: сохраняем в «Загрузки»
        results.forEach(function (f) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(f);
          a.download = f.name;
          a.click();
          URL.revokeObjectURL(a.href);
        });
        setStatus('Все фото сохранены.');
        startBtn.disabled = false;
      }
    }

    tryNext(0);
  }

  formatSelect.addEventListener('change', onFormatChange);
  ratioW.addEventListener('input', updatePreview);
  ratioH.addEventListener('input', updatePreview);
  segmented.addEventListener('click', onBgClick);
  fileInput.addEventListener('change', function () {
    loadFiles(this.files);
  });
  startBtn.addEventListener('click', processAll);

  // Drag-and-drop support (desktop)
  const dropZone = document.getElementById('drop-zone');
  if (dropZone) {
    ['dragenter', 'dragover'].forEach(function (eventName) {
      dropZone.addEventListener(eventName, function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drop-active');
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      });
    });

    ['dragleave', 'dragend', 'drop'].forEach(function (eventName) {
      dropZone.addEventListener(eventName, function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drop-active');
      });
    });

    dropZone.addEventListener('drop', function (e) {
      const dt = e.dataTransfer;
      if (!dt || !dt.files || !dt.files.length) return;
      loadFiles(dt.files);
    });
  }

  onFormatChange();
})();
