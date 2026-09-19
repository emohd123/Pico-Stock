'use strict';
/*
 * Name screening for the booth.
 *
 * Whatever a guest types goes onto a public screen, so a name is screened before it can be
 * generated. Everything here runs on the device with no network.
 *
 * Two competing risks are being balanced. Letting a slur onto the LED screen is the worse
 * failure, but wrongly refusing somebody's real name is an insult delivered to their face, so
 * precision matters as much as coverage. That is why most terms only match as whole words:
 * "Hassan", "Cumhur" and "Shita" are real names that naively contain blocked substrings.
 * Only terms that cannot plausibly sit inside a legitimate name are matched anywhere.
 *
 * Extend BLOCK_EXACT freely. Add to BLOCK_ANYWHERE only after checking the term cannot appear
 * inside a real name in any language you expect at the booth.
 */
(function (global) {

  /* Matched only as the whole name, after normalisation. Safe for anything short. */
  var BLOCK_EXACT = [
    // English
    // Obfuscated spellings survive normalisation as their own words, so they are listed too:
    // "f*ck" collapses to "fck", and "f4ck" lands on "fack" once 4 is folded to a.
    'fuck', 'fck', 'fuk', 'fack', 'fuq', 'fux', 'phuck', 'shit', 'shyt', 'sht',
    'crap', 'piss', 'dick', 'cock', 'prick', 'cunt', 'twat', 'btch', 'bich', 'azz',
    'bitch', 'bastard', 'slut', 'whore', 'hoe', 'wanker', 'bollocks', 'arse', 'ass', 'asshole',
    'anal', 'anus', 'penis', 'vagina', 'boobs', 'tits', 'titty', 'porn', 'sex', 'sexy', 'rape',
    'nigger', 'nigga', 'faggot', 'fag', 'retard', 'spastic', 'chink', 'kike', 'wetback',
    'nazi', 'hitler', 'isis', 'daesh', 'alqaeda', 'terrorist',
    'damn', 'bloody', 'bugger', 'git', 'prat', 'knob', 'jerk',
    // Arabic
    'كس', 'كسم', 'كسمك', 'طيز', 'زب', 'زبي', 'نيك', 'نيكك', 'منيوك', 'منيوكه',
    'شرموط', 'شرموطه', 'قحبه', 'عاهره', 'خول', 'لوطي', 'متناك', 'متناكه',
    'حقير', 'وسخ', 'خرا', 'خره', 'زفت', 'تفو',
    'كلب', 'كلبه', 'حمار', 'حماره', 'خنزير', 'قرد', 'بهيمه', 'غبي', 'غبيه', 'احمق',
    'لعنه', 'يلعن', 'حيوان', 'مجنون', 'كافر', 'ملحد',
    // Arabic written in Latin letters
    'kis', 'kus', 'kosom', 'kosomak', 'teez', 'zeb', 'neek', 'nik', 'manyook', 'manyak',
    'sharmoot', 'sharmoota', 'gahba', 'kahba', 'khawal', 'ayri', 'ayre', 'khara',
    'kalb', 'hmar', 'himar', 'khanzeer', 'zft'
  ];

  /* Matched anywhere in the name. Every entry here must be long and distinctive enough that it
     cannot appear inside a real given name. Keep this list short. */
  var BLOCK_ANYWHERE = [
    'fuck', 'motherfucker', 'nigger', 'faggot', 'cunt', 'asshole', 'bitch', 'whore',
    'shithead', 'dickhead', 'bastard', 'pornhub', 'rapist',
    'كسمك', 'شرموط', 'منيوك', 'متناك', 'كسختك',
    'kosomak', 'sharmoot', 'manyook'
  ];

  /* Leetspeak and lookalike digits, so "f4ck" and "sh1t" do not walk straight through. */
  var LEET = {
    '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g',
    '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't', '*': 'a'
  };

  function normalise(value) {
    var text = String(value || '').toLowerCase().normalize('NFKD');

    // Drop combining marks: Latin accents and Arabic harakat alike.
    text = text.replace(/[̀-ͯؐ-ًؚ-ٰٟۖ-ۭ]/g, '');

    // Fold Arabic letter variants so one spelling covers many.
    text = text.replace(/[أإآٱ]/g, 'ا')
               .replace(/ى/g, 'ي')
               .replace(/ة/g, 'ه')
               .replace(/ؤ/g, 'و')
               .replace(/ئ/g, 'ي');

    text = text.replace(/[013456789@$!|+*]/g, function (ch) { return LEET[ch] || ch; });

    // "fuuuuck" and "f u c k" should both land on "fuck".
    text = text.replace(/[^\p{L}]+/gu, '');
    text = text.replace(/(.)\1+/g, '$1');
    return text;
  }

  // Collapsed repeats must be applied to the list too, or "fuck" would never equal itself.
  function prepare(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var term = normalise(list[i]);
      if (term && out.indexOf(term) === -1) out.push(term);
    }
    return out;
  }

  var EXACT = prepare(BLOCK_EXACT);
  var ANYWHERE = prepare(BLOCK_ANYWHERE);

  /** True when the name is acceptable to put on a public screen. */
  function isClean(value) {
    var text = normalise(value);
    if (!text) return false;
    if (EXACT.indexOf(text) !== -1) return false;
    for (var i = 0; i < ANYWHERE.length; i++) {
      if (text.indexOf(ANYWHERE[i]) !== -1) return false;
    }
    return true;
  }

  global.NameArtProfanity = { isClean: isClean, normalise: normalise };

}(window));
