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

// The render itself takes well under a second. The booth deliberately holds the moment so the
// guest watches their name resolve, rather than having it appear before they have looked up.
var GENERATE_MS = 4000;
var STEPS = [
  { at: 0,    en: 'Preparing your design…',      ar: 'نجهّز تصميمك…' },
  { at: 1100, en: 'Setting your name in gold…',  ar: 'نكتب اسمك بالذهب…' },
  { at: 2300, en: 'Engraving the lettering…',    ar: 'ننقش الحروف…' },
  { at: 3300, en: 'Almost ready…',               ar: 'اقتربنا…' }
];

var $ = function (id) { return document.getElementById(id); };
var chosen = DESIGNS[0], idleTimer = null, stepTimers = [];

function cleanGuestName(value) {
  if (typeof value !== 'string') return '';
  var name = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  return /^[\p{L}\p{M}][\p{L}\p{M} '’-]{0,29}$/u.test(name) ? name : '';
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
/* The name block.

   `image` may be null, which draws the lettering alone on a transparent canvas. The preview
   uses that so the backdrop can sit in its own <img> underneath and the lettering can be
   masked on its own for the writing reveal. The saved file is always drawn with the
   background in the same call, so the two can never drift apart.

   Up to three lines: what the guest typed, their name in Arabic calligraphy when we are sure
   of it, and its meaning when that is well established. An unknown name is simply one line. */
function drawPoster(ctx, image, rawName, design) {
  ctx.clearRect(0, 0, W, H);
  if (image) ctx.drawImage(image, 0, 0, W, H);
  if (!rawName) return;

  var typedArabic = /\p{Script=Arabic}/u.test(rawName);
  var entry = window.NameTable ? window.NameTable.lookup(rawName) : null;

  var lines = [];
  lines.push(typedArabic
    ? { text: rawName, face: 'calligraphy', size: 250 }
    : { text: rawName.toLocaleUpperCase('en'), face: 'latin', size: 210 });
  if (!typedArabic && entry) lines.push({ text: entry.ar, face: 'calligraphy', size: 158 });
  if (entry && entry.meaning) lines.push({ text: entry.meaning, face: 'meaning', size: 54 });

  lines.forEach(function (line, index) {
    ctx.font = faceFont(line.face, line.size);
    while (ctx.measureText(line.text).width > W * design.width && line.size > 40) {
      line.size -= 2;
      ctx.font = faceFont(line.face, line.size);
    }
    // Ruqaa swings well below the baseline, so it is given more room than the Latin face.
    line.height = line.size * (line.face === 'calligraphy' ? 1.02 : 0.76);
    line.lead = index === 0 ? 0 : (line.face === 'meaning' ? line.size * 1.7 : line.size * 0.40);
  });

  var total = lines.reduce(function (sum, line) { return sum + line.height + line.lead; }, 0);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  var y = H * design.centre - total / 2;
  lines.forEach(function (line) {
    y += line.lead + line.height / 2;
    ctx.font = faceFont(line.face, line.size);
    ctx.direction = line.face === 'calligraphy' ? 'rtl' : 'ltr';
    if (line.face === 'meaning') drawMeaning(ctx, line.text, W / 2, y);
    else drawEngraved(ctx, line.text, W / 2, y, line.size);
    y += line.height / 2;
  });
}

function faceFont(face, size) {
  if (face === 'calligraphy') return '700 ' + size + 'px NameArtCalligraphy';
  if (face === 'meaning') return '600 ' + size + 'px NameArtSerif';
  return '600 ' + size + 'px NameArtSerif';
}

/* Gold edge over a deep green fill - the same treatment the server renderer uses. */
function drawEngraved(ctx, text, x, y, size) {
  ctx.lineWidth = Math.max(3, size * 0.024);
  ctx.shadowColor = '#44301880'; ctx.shadowBlur = 6; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 8;
  ctx.strokeStyle = '#76501e';
  ctx.strokeText(text, x, y + 2);

  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.lineWidth = Math.max(2, size * 0.014);
  ctx.strokeStyle = '#d8b76f';
  ctx.strokeText(text, x, y);

  var fill = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  fill.addColorStop(0, '#264331');
  fill.addColorStop(0.45, '#092b20');
  fill.addColorStop(1, '#163d2b');
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/* The meaning is a caption, not a second title: no gold, no weight, well back. */
function drawMeaning(ctx, text, x, y) {
  ctx.shadowColor = 'transparent';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
  ctx.fillStyle = '#7d6539';
  ctx.fillText(text.toLocaleUpperCase('en'), x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
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

var preview = $('preview'), pctx = preview.getContext('2d'), stage = $('stage');
preview.width = W; preview.height = H;
document.documentElement.style.setProperty('--gen', GENERATE_MS + 'ms');

function refreshPreview() {
  $('bg').src = chosen.src;
  // Screened, not merely well-formed: a blocked word must never reach the preview either.
  // The tablet faces the queue, so drawing it there would defeat the point of refusing it.
  drawPoster(pctx, null, nameIsUsable($('name').value) || '', chosen);
}

function touch() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(reset, IDLE_RESET_MS);
}

function clearSteps() {
  stepTimers.forEach(clearTimeout);
  stepTimers = [];
}

function reset() {
  clearTimeout(idleTimer);
  clearSteps();
  stage.classList.remove('working', 'revealed');
  $('name').value = '';
  chosen = DESIGNS[0];
  Array.prototype.forEach.call($('designs').children, function (child, index) {
    child.setAttribute('aria-pressed', String(index === 0));
  });
  $('err').hidden = true;
  $('saveNote').hidden = true;
  $('qr').hidden = true;
  $('genPanel').hidden = true;
  $('donePanel').hidden = true;
  $('formPanel').hidden = false;
  validate();
  refreshPreview();
}

/* A blocked name is refused quietly. The guest is told the name cannot be used, not which
   rule caught it, so the screening does not become a game to beat. */
var NAME_HINT = 'Please enter the name you would like on your poster.';

function screener() {
  return window.NameArtProfanity || null;
}

/* Returns the name to use, or '' when it is malformed or not fit for a public screen. */
function nameIsUsable(raw) {
  var name = cleanGuestName(raw);
  if (!name) return '';
  var guard = screener();
  if (guard && !guard.isClean(name)) return '';
  return name;
}

function validate() {
  var formatted = cleanGuestName($('name').value);
  var usable = nameIsUsable($('name').value);
  var box = $('err');
  $('create').disabled = !usable;

  // Only speak up once what they typed is a plausible name but not one we can display.
  if (formatted && !usable) {
    box.textContent = NAME_HINT;
    box.hidden = false;
  } else if (box.textContent === NAME_HINT) {
    box.hidden = true;
  }
}

function fail(message) {
  var box = $('err');
  box.textContent = message;
  box.hidden = false;
}

/* The fixed guest QR. It always points at this tablet, and the tablet always serves whatever
   poster was generated most recently, so one printed code works for every guest. */
function showGuestQr() {
  var address = '';
  try {
    if (window.AndroidBooth && window.AndroidBooth.boothAddress) {
      address = window.AndroidBooth.boothAddress();
    }
  } catch (error) { address = ''; }

  if (!address) {
    $('qr').hidden = true;
    $('qrLead').textContent = 'Your poster is saved on this tablet.';
    $('addr').textContent = 'No network, so there is nothing for a phone to scan.';
    return;
  }

  var png = '';
  try { png = window.AndroidBooth.qrDataUrl(address, 480); } catch (error) { png = ''; }
  if (png) {
    $('qr').src = png;
    $('qr').hidden = false;
  }
  $('qrLead').textContent = 'Scan to download your poster.';
  $('addr').textContent = address;
}

function runSteps() {
  clearSteps();
  STEPS.forEach(function (stepData) {
    stepTimers.push(setTimeout(function () {
      $('step').textContent = stepData.en;
      $('stepAr').textContent = stepData.ar;
    }, stepData.at));
  });
}

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function create() {
  // Re-screened here as well: validate() guards the button, this guards the render.
  var name = nameIsUsable($('name').value);
  if (!name) { validate(); return; }
  $('create').disabled = true;
  $('err').hidden = true;

  // Start the performance first so the guest never stares at a frozen button.
  $('formPanel').hidden = true;
  $('genPanel').hidden = false;
  $('step').textContent = STEPS[0].en;
  $('stepAr').textContent = STEPS[0].ar;
  stage.classList.remove('revealed');
  stage.classList.add('working');
  runSteps();

  var startedAt = Date.now();
  try {
    // Canvas silently falls back to a system font unless the face is actually loaded first.
    await document.fonts.load('600 210px NameArtSerif');
    await document.fonts.load('700 205px NameArtArabic');
    await document.fonts.load('700 250px NameArtCalligraphy');

    var image = await loadImage(chosen.src);
    var out = document.createElement('canvas');
    out.width = W; out.height = H;
    drawPoster(out.getContext('2d'), image, name, chosen);

    // Draw the finished poster straight away; the CSS resolves it out of a blur.
    drawPoster(pctx, null, name, chosen);

    var dataUrl = out.toDataURL('image/jpeg', 0.94);

    var stamp = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var file = 'NameArt-' + name.replace(/[^\p{L}\p{M}]+/gu, '-') + '-' +
      stamp.getFullYear() + pad(stamp.getMonth() + 1) + pad(stamp.getDate()) + '-' +
      pad(stamp.getHours()) + pad(stamp.getMinutes()) + pad(stamp.getSeconds()) + '.jpg';

    var saved = '';
    if (window.AndroidBooth && window.AndroidBooth.savePoster) {
      saved = window.AndroidBooth.savePoster(dataUrl, file);
    }

    // Hold the full window even when the render finished in a fraction of it.
    await wait(Math.max(0, GENERATE_MS - (Date.now() - startedAt)));

    clearSteps();
    stage.classList.remove('working');
    stage.classList.add('revealed');

    showGuestQr();
    if (!saved) {
      $('saveNote').textContent = 'Could not save a copy on this tablet.';
      $('saveNote').hidden = false;
    }
    $('genPanel').hidden = true;
    $('donePanel').hidden = false;
    touch();
  } catch (error) {
    clearSteps();
    stage.classList.remove('working');
    $('genPanel').hidden = true;
    $('formPanel').hidden = false;
    fail(error && error.message ? error.message : 'Could not create the poster.');
    $('create').disabled = false;
  }
}

$('name').addEventListener('input', function () { validate(); refreshPreview(); touch(); });
$('create').addEventListener('click', create);
$('finish').addEventListener('click', reset);
document.addEventListener('touchstart', touch, { passive: true });

buildDesignPicker();
validate();
refreshPreview();
