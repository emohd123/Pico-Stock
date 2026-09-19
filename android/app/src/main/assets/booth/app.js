'use strict';
/*
 * Offline Name Art booth.
 *
 * The poster is rendered here on the device, using the same geometry and colours as the
 * server renderer in lib/nameArt/render.js, so an offline poster is indistinguishable from
 * one the website produced. Nothing here needs a network.
 */

// centre/width are fractions of the canvas: where the name sits and how wide it may run.
var DESIGNS = [
  { id: 'pearls',  name: 'Pearls & ribbons', src: 'img/pearls.webp',  centre: 0.46, width: 0.82 },
  { id: 'skyline', name: 'Shared skyline',   src: 'img/skyline.webp', centre: 0.39, width: 0.82 },
  { id: 'arch',    name: 'Heritage arch',    src: 'img/arch.webp',    centre: 0.45, width: 0.64 }
];
var W = 1536, H = 2304, IDLE_RESET_MS = 90000;

var $ = function (id) { return document.getElementById(id); };
var chosen = DESIGNS[0], idleTimer = null, lastBlob = null;

function cleanGuestName(value) {
  if (typeof value !== 'string') return '';
  var name = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  return /^[\p{L}\p{M}][\p{L}\p{M} '\u2019-]{0,29}$/u.test(name) ? name : '';
}

function loadImage(src) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error('Could not load ' + src)); };
    img.src = src;
  });
}

/* Mirrors renderNameArt(): backdrop, shrink-to-fit, gold stroke, then the emerald gradient fill. */
function drawPoster(ctx, image, rawName, design) {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(image, 0, 0, W, H);
  if (!rawName) return;

  var arabic = /\p{Script=Arabic}/u.test(rawName);
  var text = arabic ? rawName : rawName.toLocaleUpperCase('en');
  var size = arabic ? 205 : 210;
  var font = function () {
    return (arabic ? '700 ' : '600 ') + size + 'px ' + (arabic ? 'NameArtArabic' : 'NameArtSerif');
  };

  ctx.font = font();
  while (ctx.measureText(text).width > W * design.width && size > 50) { size -= 2; ctx.font = font(); }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = arabic ? 'rtl' : 'ltr';

  var x = W / 2, y = H * design.centre;
  ctx.lineJoin = 'round';

  ctx.lineWidth = 5;
  ctx.shadowColor = '#44301880'; ctx.shadowBlur = 6; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 8;
  ctx.strokeStyle = '#76501e';
  ctx.strokeText(text, x, y + 2);

  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#d8b76f';
  ctx.strokeText(text, x, y);

  var fill = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  fill.addColorStop(0, '#264331');
  fill.addColorStop(0.45, '#092b20');
  fill.addColorStop(1, '#163d2b');
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function buildDesignPicker() {
  var host = $('designs');
  DESIGNS.forEach(function (design) {
    var button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(design.id === chosen.id));
    button.innerHTML = '<img src="' + design.src + '" alt=""><span>' + design.name + '</span>';
    button.addEventListener('click', function () {
      chosen = design;
      Array.prototype.forEach.call(host.children, function (child, index) {
        child.setAttribute('aria-pressed', String(DESIGNS[index].id === chosen.id));
      });
      refreshPreview();
      touch();
    });
    host.appendChild(button);
  });
}

var preview = $('preview'), pctx = preview.getContext('2d');
preview.width = W; preview.height = H;

function refreshPreview() {
  $('bg').src = chosen.src;
  loadImage(chosen.src).then(function (image) {
    drawPoster(pctx, image, cleanGuestName($('name').value) || '', chosen);
  }).catch(function () {});
}

function touch() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(reset, IDLE_RESET_MS);
}

function reset() {
  clearTimeout(idleTimer);
  $('name').value = '';
  $('consent').checked = false;
  chosen = DESIGNS[0];
  Array.prototype.forEach.call($('designs').children, function (child, index) {
    child.setAttribute('aria-pressed', String(index === 0));
  });
  $('err').hidden = true;
  $('savedAs').textContent = '';
  $('donePanel').hidden = true;
  $('formPanel').hidden = false;
  validate();
  refreshPreview();
}

function validate() {
  $('create').disabled = !(cleanGuestName($('name').value) && $('consent').checked);
}

function fail(message) {
  var box = $('err');
  box.textContent = message;
  box.hidden = false;
}

async function create() {
  var name = cleanGuestName($('name').value);
  if (!name || !$('consent').checked) return;
  $('create').disabled = true;
  $('err').hidden = true;
  try {
    // Canvas silently falls back to a system font unless the face is actually loaded first.
    await document.fonts.load('600 210px NameArtSerif');
    await document.fonts.load('700 205px NameArtArabic');

    var image = await loadImage(chosen.src);
    var out = document.createElement('canvas');
    out.width = W; out.height = H;
    drawPoster(out.getContext('2d'), image, name, chosen);

    var dataUrl = out.toDataURL('image/jpeg', 0.94);
    drawPoster(pctx, image, name, chosen);

    var stamp = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var file = 'NameArt-' + name.replace(/[^\p{L}\p{M}]+/gu, '-') + '-' +
      stamp.getFullYear() + pad(stamp.getMonth() + 1) + pad(stamp.getDate()) + '-' +
      pad(stamp.getHours()) + pad(stamp.getMinutes()) + pad(stamp.getSeconds()) + '.jpg';

    var saved = '';
    if (window.AndroidBooth && window.AndroidBooth.savePoster) {
      saved = window.AndroidBooth.savePoster(dataUrl, file);
    }
    $('savedAs').textContent = saved ? 'Saved as ' + saved : 'Preview only: could not save to this tablet.';
    $('formPanel').hidden = true;
    $('donePanel').hidden = false;
    touch();
  } catch (error) {
    fail(error && error.message ? error.message : 'Could not create the poster.');
    $('create').disabled = false;
  }
}

$('name').addEventListener('input', function () { validate(); refreshPreview(); touch(); });
$('consent').addEventListener('change', function () { validate(); touch(); });
$('create').addEventListener('click', create);
$('finish').addEventListener('click', reset);
document.addEventListener('touchstart', touch, { passive: true });

buildDesignPicker();
validate();
refreshPreview();
