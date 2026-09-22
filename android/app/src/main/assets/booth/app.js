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
  { id: 'gateway', name: 'Two shores',      src: 'img/gateway.webp', centre: 0.394, width: 0.80 },
  { id: 'arch2',   name: 'Heritage arch',   src: 'img/arch2.webp',   centre: 0.445, width: 0.46 },
  { id: 'shore',   name: 'Shared skyline',  src: 'img/shore.webp',   centre: 0.486, width: 0.68 },
  { id: 'waves',   name: 'Gulf waves',      src: 'img/waves.webp',   centre: 0.486, width: 0.70 }
];
// The poster is 1:2, the shape of the LED panel, so it fills the screen edge to edge
// instead of leaving bands above and below it.
var W = 1536, H = 3072, IDLE_RESET_MS = 90000;

// The render itself takes well under a second. The booth deliberately holds the moment so the
// guest watches their name resolve, rather than having it appear before they have looked up.
var GENERATE_MS = 4000;
var SCREEN_STEP = { en: 'Putting your name on the big screen…', ar: 'نضع اسمك على الشاشة…' };
var STEPS = [
  { at: 0,    en: 'Preparing your design…',      ar: 'نجهّز تصميمك…' },
  { at: 1100, en: 'Setting your name in gold…',  ar: 'نكتب اسمك بالذهب…' },
  { at: 2300, en: 'Engraving the lettering…',    ar: 'ننقش الحروف…' },
  { at: 3300, en: 'Almost ready…',               ar: 'اقتربنا…' }
];

/* The three styles. Each pairs a Latin face with an Arabic hand, so one tap restyles both
   lines of the poster rather than leaving an ornate Arabic name under a plain Latin one.
   The chip shows the Arabic word in its hand and its own label in its Latin face, so both
   halves of the pairing are visible before the guest commits. All SIL OFL - see font/. */
var SCRIPTS = [
  { id: 'ornate',   face: 'CalliOrnate',   latin: 'LatinOrnate',   latinWeight: '700',
    label: 'ORNATE',   sample: 'اسمك' },
  { id: 'classic',  face: 'CalliClassic',  latin: 'NameArtSerif',  latinWeight: '600',
    label: 'CLASSIC',  sample: 'اسمك' },
  { id: 'delicate', face: 'CalliDelicate', latin: 'LatinDelicate', latinWeight: '400',
    label: 'DELICATE', sample: 'اسمك' }
];

var $ = function (id) { return document.getElementById(id); };
var chosen = DESIGNS[0], script = SCRIPTS[0], idleTimer = null, stepTimers = [];

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

   Two lines: what the guest typed, and their name in Arabic calligraphy when we are sure of
   it. An unknown name is simply one line. */
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

  lines.forEach(function (line, index) {
    ctx.font = faceFont(line.face, line.size);
    while (ctx.measureText(line.text).width > W * design.width && line.size > 40) {
      line.size -= 2;
      ctx.font = faceFont(line.face, line.size);
    }
    // Ruqaa swings well below the baseline, so it is given more room than the Latin face.
    line.height = line.size * (line.face === 'calligraphy' ? 1.02 : 0.76);
    line.lead = index === 0 ? 0 : line.size * 0.40;
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
    drawEngraved(ctx, line.text, W / 2, y, line.size);
    y += line.height / 2;
  });
}

function faceFont(face, size) {
  if (face === 'calligraphy') return '400 ' + size + 'px ' + script.face;
  return script.latinWeight + ' ' + size + 'px ' + script.latin;
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

function buildScriptPicker() {
  var host = $('scripts');
  SCRIPTS.forEach(function (option) {
    var button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(option === script));
    button.innerHTML = '<b style="font-family:' + option.face + '">' + option.sample +
                       '</b><i style="font-family:' + option.latin + ';font-weight:' +
                       option.latinWeight + '">' + option.label + '</i>';
    button.addEventListener('click', function () {
      script = option;
      Array.prototype.forEach.call(host.children, function (child, index) {
        child.setAttribute('aria-pressed', String(SCRIPTS[index] === script));
      });
      refreshPreview();
      touch();
    });
    host.appendChild(button);
  });
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
  // The poster screen follows the booth: once this guest is done their name comes off it.
  try { if (window.AndroidBooth && window.AndroidBooth.clearScreen) window.AndroidBooth.clearScreen(); } catch (error) { }
  stage.classList.remove('working', 'revealed');
  $('name').value = '';
  chosen = DESIGNS[0];
  Array.prototype.forEach.call($('designs').children, function (child, index) {
    child.setAttribute('aria-pressed', String(index === 0));
  });
  script = SCRIPTS[0];
  Array.prototype.forEach.call($('scripts').children, function (child, index) {
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

/* Resolves once the poster is on the screen, or once we have waited long enough. Returns
   immediately when nothing is being published, so an offline booth is not slowed down. */
async function waitForScreen() {
  if (!window.AndroidBooth || !window.AndroidBooth.cloudState) return;
  var state = '';
  try { state = window.AndroidBooth.cloudState(); } catch (error) { return; }
  if (state === 'off' || state === 'failed') return;

  $('step').textContent = SCREEN_STEP.en;
  $('stepAr').textContent = SCREEN_STEP.ar;

  var until = Date.now() + 13000;
  while (Date.now() < until) {
    await wait(400);
    try { state = window.AndroidBooth.cloudState(); } catch (error) { return; }
    if (state === 'shown' || state === 'failed' || state === 'off') return;
  }
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
    await document.fonts.load(script.latinWeight + ' 210px ' + script.latin);
    await document.fonts.load('700 205px NameArtArabic');
    await document.fonts.load('400 250px ' + script.face);

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

    /* Mirror the poster to the website so a laptop on any network can show it. Fire and
       forget: the booth works offline, so this must never delay or fail a guest's poster. */
    try {
      if (window.AndroidBooth && window.AndroidBooth.publishToCloud) {
        var requestId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
              var r = Math.random() * 16 | 0;
              return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
        window.AndroidBooth.publishToCloud(dataUrl, name, chosen.id, requestId);
      }
    } catch (error) { }

    // Hold the full window even when the render finished in a fraction of it.
    await wait(Math.max(0, GENERATE_MS - (Date.now() - startedAt)));

    /* Then hold a moment longer, until the name is actually on the big screen.

       The upload and the screen's own poll take a couple of seconds, and handing a guest
       their QR while the wall is still blank makes the booth look broken. So the generating
       sequence simply continues with a line about the screen, and the QR arrives once the
       poster is up. This waits on the real state rather than a guessed delay - and it caps
       itself, so a screen that is switched off or offline never strands anybody. */
    await waitForScreen();

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

/* Canvas never triggers @font-face loading - only text in the document does. NameArtSerif and
   NameArtArabic are pulled in by the markup, but the calligraphic face appears nowhere except
   in a canvas call, so without this it silently falls back to a system Naskh and the guest
   gets ordinary type where the calligraphy should be. Prime it, then redraw. */
function primeFonts() {
  if (!document.fonts || !document.fonts.load) return;
  var wanted = [document.fonts.load('700 205px NameArtArabic')];
  SCRIPTS.forEach(function (option) {
    wanted.push(document.fonts.load('400 250px ' + option.face));
    wanted.push(document.fonts.load(option.latinWeight + ' 210px ' + option.latin));
  });
  Promise.all(wanted).then(refreshPreview, function () {});
}

buildDesignPicker();
buildScriptPicker();
primeFonts();
validate();
refreshPreview();
