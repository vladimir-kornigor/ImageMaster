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

  const PREVIEW_MAX = 360;

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
    const scale = Math.max(canvasW / img.width, canvasH / img.height);
    const bigW = img.width * scale;
    const bigH = img.height * scale;
    const sx = (bigW - canvasW) / 2;
    const sy = (bigH - canvasH) / 2;

    const smallW = Math.max(1, Math.floor(canvasW / 6));
    const smallH = Math.max(1, Math.floor(canvasH / 6));
    const offscreen = document.createElement('canvas');
    offscreen.width = smallW;
    offscreen.height = smallH;
    const offCtx = offscreen.getContext('2d');
    offCtx.drawImage(img, sx, sy, canvasW, canvasH, 0, 0, smallW, smallH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(offscreen, 0, 0, smallW, smallH, 0, 0, canvasW, canvasH);
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
    var oldW = img.naturalWidth || img.width;
    var oldH = img.naturalHeight || img.height;
    var size = canvasSize(oldW, oldH, ratio);
    var scale = Math.min(PREVIEW_MAX / size.width, 220 / size.height, 1);
    var outW = Math.round(size.width * scale);
    var outH = Math.round(size.height * scale);
    var canvas = drawResult(img, ratio, bgMode, outW, outH);
    if (!canvas) return;
    var ctx = previewCanvas.getContext('2d');
    previewCanvas.width = canvas.width;
    previewCanvas.height = canvas.height;
    ctx.drawImage(canvas, 0, 0);
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

  function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function canShareFile() {
    return navigator.share && navigator.canShare && typeof navigator.canShare === 'function';
  }

  function shareImageToPhotos(blob, name) {
    if (!canShareFile()) return Promise.resolve(false);
    var file = new File([blob], name, { type: 'image/jpeg' });
    if (!navigator.canShare({ files: [file] })) return Promise.resolve(false);
    return navigator.share({ files: [file], title: 'ImageMaster' }).then(function () { return true; }, function () { return false; });
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
    setStatus('Обработка…');
    var done = 0;
    var total = files.length;
    var useShare = canShareFile();

    function tryNext(i) {
      if (i >= total) {
        startBtn.disabled = false;
        setStatus(useShare ? 'Готово. Сохранено в Фото: ' + done : 'Готово. Скачано: ' + done);
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
        done++;
        setStatus('Обработано ' + done + ' из ' + total);
        next(i + 1);
        return;
      }
      var canvas = drawResult(img, ratio, bgMode);
      if (!canvas) {
        done++;
        setStatus('Обработано ' + done + ' из ' + total);
        next(i + 1);
        return;
      }
      var base = file.name.replace(/\.[^.]+$/, '');
      var ext = file.name.match(/\.[^.]+$/);
      ext = ext ? ext[0] : '.jpg';
      var name = base + '_ratio' + canvas.width + 'x' + canvas.height + ext;

      canvas.toBlob(
        function (blob) {
          if (!blob) {
            setStatus('Обработано ' + (done + 1) + ' из ' + total);
            next(i + 1);
            return;
          }
          setStatus(useShare ? 'Сохраните в Фото (' + (done + 1) + '/' + total + ')…' : 'Обработано ' + (done + 1) + ' из ' + total);

          if (useShare) {
            shareImageToPhotos(blob, name).then(function (shared) {
              if (!shared) downloadBlob(blob, name);
              done += 1;
              setStatus(shared ? 'Сохранено в Фото: ' + done + ' из ' + total : 'Обработано ' + done + ' из ' + total);
              next(i + 1);
            });
          } else {
            downloadBlob(blob, name);
            done += 1;
            setStatus('Обработано ' + done + ' из ' + total);
            next(i + 1);
          }
        },
        'image/jpeg',
        0.92
      );
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

  onFormatChange();
})();
