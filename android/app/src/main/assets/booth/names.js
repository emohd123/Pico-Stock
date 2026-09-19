/* Curated name table: Latin spelling -> Arabic form, and where it is well established, a
   short meaning.

   This is deliberately a closed list rather than a transliteration algorithm. Rule-based
   English->Arabic transliteration gets names wrong often enough that it is the wrong trade
   here: a guest's name misspelled in Arabic on a keepsake they take home is worse than no
   Arabic at all. So an unknown name simply stays in Latin and the poster is still correct.

   `meaning` is kept alongside each entry but is NOT rendered on the poster - the poster shows
   the two names and nothing else. It is retained because it is the natural place for it if it
   is ever wanted again; it has not been checked by a native speaker, so anything that turns it
   back on needs to do that first.

   Latin spellings are matched loosely (see normalise): case, spaces, hyphens, apostrophes
   and doubled letters are all ignored, so "Abdul Rahman", "abdulrahman" and "Abdurrahman"
   all land on the same entry. */
(function (global) {
  'use strict';

  var ENTRIES = [
    // — male —————————————————————————————————————————————————————————————
    { ar: 'محمد', meaning: 'The praised one', latin: ['mohammed', 'muhammad', 'mohamed', 'mohammad', 'muhammed', 'mohd'] },
    { ar: 'أحمد', meaning: 'Most praiseworthy', latin: ['ahmed', 'ahmad'] },
    { ar: 'علي', meaning: 'Exalted', latin: ['ali', 'aly'] },
    { ar: 'عمر', meaning: 'Flourishing, long-lived', latin: ['omar', 'umar'] },
    { ar: 'عبدالله', meaning: 'Servant of God', latin: ['abdullah', 'abdallah', 'abdulla', 'abdollah'] },
    { ar: 'عبدالرحمن', meaning: 'Servant of the Most Merciful', latin: ['abdulrahman', 'abdulrahmaan', 'abdurrahman', 'abdelrahman'] },
    { ar: 'عبدالعزيز', meaning: 'Servant of the Almighty', latin: ['abdulaziz', 'abdelaziz', 'abdulazeez'] },
    { ar: 'خالد', meaning: 'Eternal', latin: ['khalid', 'khaled'] },
    { ar: 'سعود', meaning: 'Good fortune', latin: ['saud', 'saood'] },
    { ar: 'فيصل', meaning: 'Decisive', latin: ['faisal', 'faysal', 'fasial'] },
    { ar: 'فهد', meaning: 'Cheetah', latin: ['fahad', 'fahd'] },
    { ar: 'تركي', latin: ['turki', 'turkey'] },
    { ar: 'بندر', meaning: 'Harbour', latin: ['bandar'] },
    { ar: 'ناصر', meaning: 'Victorious', latin: ['nasser', 'nasir', 'naser', 'nassir'] },
    { ar: 'سلمان', meaning: 'Safe', latin: ['salman', 'salmaan'] },
    { ar: 'سلطان', meaning: 'Sovereign', latin: ['sultan', 'soltan'] },
    { ar: 'ماجد', meaning: 'Glorious', latin: ['majed', 'majid', 'maged'] },
    { ar: 'حمد', meaning: 'Praise', latin: ['hamad'] },
    { ar: 'حمدان', meaning: 'Much praised', latin: ['hamdan'] },
    { ar: 'راشد', meaning: 'Rightly guided', latin: ['rashid', 'rashed'] },
    { ar: 'صالح', meaning: 'Righteous', latin: ['saleh', 'salih', 'salah'] },
    { ar: 'يوسف', latin: ['youssef', 'yusuf', 'yousef', 'yousif', 'yusif', 'joseph'] },
    { ar: 'إبراهيم', latin: ['ibrahim', 'ebrahim', 'ibraheem', 'abraham'] },
    { ar: 'إسماعيل', latin: ['ismail', 'ismaeel', 'esmail'] },
    { ar: 'حسن', meaning: 'Handsome, good', latin: ['hassan', 'hasan'] },
    { ar: 'حسين', meaning: 'Handsome, good', latin: ['hussein', 'hussain', 'husain', 'husein'] },
    { ar: 'منصور', meaning: 'Aided to victory', latin: ['mansour', 'mansoor'] },
    { ar: 'طارق', meaning: 'The morning star', latin: ['tariq', 'tarek', 'tarik', 'tareq'] },
    { ar: 'زياد', meaning: 'Abundance', latin: ['ziad', 'zeyad', 'ziyad'] },
    { ar: 'عادل', meaning: 'Just', latin: ['adel', 'adil'] },
    { ar: 'أنس', meaning: 'Affection', latin: ['anas'] },
    { ar: 'أيمن', meaning: 'Blessed', latin: ['ayman', 'aiman'] },
    { ar: 'بدر', meaning: 'Full moon', latin: ['bader', 'badr', 'badar'] },
    { ar: 'باسل', meaning: 'Brave', latin: ['basel', 'basil', 'bassel'] },
    { ar: 'بلال', latin: ['bilal', 'belal'] },
    { ar: 'عماد', meaning: 'Pillar, support', latin: ['emad', 'imad'] },
    { ar: 'فراس', meaning: 'Keen, perceptive', latin: ['firas', 'feras'] },
    { ar: 'غانم', meaning: 'One who gains', latin: ['ghanim', 'ghanem'] },
    { ar: 'هادي', meaning: 'Guide', latin: ['hadi', 'hady'] },
    { ar: 'هاني', meaning: 'Content', latin: ['hani', 'hany'] },
    { ar: 'هيثم', meaning: 'Young eagle', latin: ['haitham', 'haytham', 'hytham'] },
    { ar: 'حازم', meaning: 'Resolute', latin: ['hazem', 'hazim'] },
    { ar: 'عيسى', latin: ['issa', 'isa', 'essa'] },
    { ar: 'جمال', meaning: 'Beauty', latin: ['jamal', 'gamal'] },
    { ar: 'جاسم', latin: ['jasim', 'jassim', 'jasem'] },
    { ar: 'كريم', meaning: 'Generous', latin: ['karim', 'kareem'] },
    { ar: 'كمال', meaning: 'Perfection', latin: ['kamal', 'kamaal'] },
    { ar: 'ليث', meaning: 'Lion', latin: ['laith', 'layth', 'laeth'] },
    { ar: 'ماهر', meaning: 'Skilled', latin: ['maher', 'mahir'] },
    { ar: 'مالك', meaning: 'Sovereign', latin: ['malik', 'malek'] },
    { ar: 'مازن', meaning: 'Rain cloud', latin: ['mazen', 'mazin'] },
    { ar: 'مشعل', meaning: 'Beacon', latin: ['mishal', 'meshal', 'mishaal', 'meshaal'] },
    { ar: 'مبارك', meaning: 'Blessed', latin: ['mubarak', 'mbarak'] },
    { ar: 'منير', meaning: 'Radiant', latin: ['munir', 'muneer'] },
    { ar: 'موسى', latin: ['musa', 'mousa', 'moussa'] },
    { ar: 'مصطفى', meaning: 'The chosen', latin: ['mustafa', 'moustafa', 'mostafa'] },
    { ar: 'نواف', meaning: 'Lofty', latin: ['nawaf', 'nawwaf'] },
    { ar: 'نايف', meaning: 'Eminent', latin: ['nayef', 'naif', 'nayif'] },
    { ar: 'أسامة', meaning: 'Lion', latin: ['osama', 'usama', 'oussama'] },
    { ar: 'رائد', meaning: 'Pioneer', latin: ['raed', 'raid'] },
    { ar: 'راكان', meaning: 'Dignified', latin: ['rakan', 'rakaan'] },
    { ar: 'رامي', meaning: 'Archer', latin: ['rami', 'ramy'] },
    { ar: 'ريان', latin: ['rayan', 'rayyan', 'raiyan'] },
    { ar: 'سعد', meaning: 'Good fortune', latin: ['saad', 'sad'] },
    { ar: 'سامي', meaning: 'Elevated', latin: ['sami', 'samy'] },
    { ar: 'شريف', meaning: 'Noble', latin: ['sharif', 'shareef', 'sherif'] },
    { ar: 'سليمان', latin: ['sulaiman', 'suleiman', 'sulayman', 'solomon'] },
    { ar: 'طلال', latin: ['talal', 'talaal'] },
    { ar: 'وليد', meaning: 'Newborn', latin: ['waleed', 'walid'] },
    { ar: 'يحيى', latin: ['yahya', 'yehia'] },
    { ar: 'يزيد', meaning: 'He increases', latin: ['yazeed', 'yazid'] },
    { ar: 'زايد', meaning: 'Abundance', latin: ['zayed', 'zaid', 'zayd'] },
    { ar: 'زكي', meaning: 'Pure', latin: ['zaki', 'zakee'] },
    { ar: 'فواز', meaning: 'Victorious', latin: ['fawaz', 'fawwaz'] },
    { ar: 'هشام', meaning: 'Generosity', latin: ['hisham', 'hesham'] },
    { ar: 'عمار', meaning: 'Long-lived', latin: ['ammar', 'amar'] },
    { ar: 'صقر', meaning: 'Falcon', latin: ['saqr', 'sager', 'sagr'] },
    { ar: 'مهند', meaning: 'Sword', latin: ['mohannad', 'muhannad'] },
    { ar: 'نادر', meaning: 'Rare', latin: ['nader', 'nadir'] },
    { ar: 'عبدالملك', meaning: 'Servant of the Sovereign', latin: ['abdulmalik', 'abdulmalek'] },
    { ar: 'عبدالكريم', meaning: 'Servant of the Most Generous', latin: ['abdulkarim', 'abdulkareem'] },
    { ar: 'يعقوب', latin: ['yaqoub', 'yaqub', 'yacoub', 'jacob'] },
    { ar: 'قيس', latin: ['qais', 'qays', 'kais'] },
    { ar: 'شادي', meaning: 'Singer', latin: ['shadi', 'shady'] },
    { ar: 'تامر', latin: ['tamer', 'tamir'] },
    { ar: 'وائل', latin: ['wael', 'wail'] },
    { ar: 'خليفة', meaning: 'Successor', latin: ['khalifa', 'khalifah'] },
    { ar: 'عيد', meaning: 'Festival', latin: ['eid', 'aeid'] },
    { ar: 'ضاري', latin: ['dhari', 'dari'] },
    { ar: 'سطام', latin: ['sattam', 'satam'] },

    // — female ———————————————————————————————————————————————————————————
    { ar: 'نورة', meaning: 'Light', latin: ['noura', 'nourah', 'nora', 'norah', 'nourha'] },
    { ar: 'نور', meaning: 'Light', latin: ['nour', 'noor', 'nur'] },
    { ar: 'سارة', meaning: 'Noble lady', latin: ['sara', 'sarah', 'saara'] },
    { ar: 'فاطمة', latin: ['fatima', 'fatimah', 'fatema', 'fatma'] },
    { ar: 'عائشة', meaning: 'Living, thriving', latin: ['aisha', 'aysha', 'ayesha', 'aicha'] },
    { ar: 'مريم', latin: ['maryam', 'mariam', 'meriem', 'mary'] },
    { ar: 'ريم', meaning: 'White gazelle', latin: ['reem', 'rim', 'ream'] },
    { ar: 'لولوة', meaning: 'Pearl', latin: ['lulwa', 'lulua', 'loulwa'] },
    { ar: 'لؤلؤة', meaning: 'Pearl', latin: ['lulu', 'loulou'] },
    { ar: 'حصة', meaning: 'A share, a portion', latin: ['hessa', 'hissa', 'hessah'] },
    { ar: 'منيرة', meaning: 'Radiant', latin: ['munira', 'munirah', 'muneera'] },
    { ar: 'لطيفة', meaning: 'Gentle', latin: ['latifa', 'latifah', 'lateefa'] },
    { ar: 'أمل', meaning: 'Hope', latin: ['amal', 'amaal'] },
    { ar: 'عالية', meaning: 'Exalted', latin: ['alia', 'aliya', 'aliyah', 'alya'] },
    { ar: 'دانة', meaning: 'A great pearl', latin: ['dana', 'danah', 'daana'] },
    { ar: 'جواهر', meaning: 'Jewels', latin: ['jawaher', 'jawahir'] },
    { ar: 'شيخة', latin: ['shaikha', 'sheikha', 'shaikhah'] },
    { ar: 'موزة', latin: ['moza', 'mouza', 'mozah'] },
    { ar: 'هند', latin: ['hind', 'hend'] },
    { ar: 'سلمى', meaning: 'Peaceful', latin: ['salma', 'selma'] },
    { ar: 'ليلى', meaning: 'Night', latin: ['layla', 'laila', 'leila', 'leyla'] },
    { ar: 'منى', meaning: 'Wishes', latin: ['mona', 'muna', 'mouna'] },
    { ar: 'رنا', latin: ['rana', 'ranaa'] },
    { ar: 'رانيا', latin: ['rania', 'raniya'] },
    { ar: 'دلال', latin: ['dalal', 'dalaal'] },
    { ar: 'غادة', meaning: 'Graceful', latin: ['ghada', 'ghadah'] },
    { ar: 'هالة', meaning: 'Halo round the moon', latin: ['hala', 'halah'] },
    { ar: 'هدى', meaning: 'Guidance', latin: ['huda', 'hoda', 'houda'] },
    { ar: 'إيمان', meaning: 'Faith', latin: ['iman', 'eman', 'imaan'] },
    { ar: 'جنى', meaning: 'Harvest', latin: ['jana', 'janah', 'jannah'] },
    { ar: 'لمى', latin: ['lama', 'lamaa'] },
    { ar: 'لينا', meaning: 'Tender', latin: ['lina', 'leena', 'lena'] },
    { ar: 'مها', meaning: 'Wild gazelle', latin: ['maha', 'mahaa'] },
    { ar: 'منال', meaning: 'Attainment', latin: ['manal', 'manaal'] },
    { ar: 'نجلاء', meaning: 'Wide-eyed', latin: ['najla', 'najlaa'] },
    { ar: 'ندى', meaning: 'Dew, generosity', latin: ['nada', 'nadaa'] },
    { ar: 'رهف', meaning: 'Delicate', latin: ['rahaf', 'rahf'] },
    { ar: 'رزان', meaning: 'Self-possessed', latin: ['razan', 'razaan'] },
    { ar: 'سحر', meaning: 'Dawn', latin: ['sahar', 'sahaar'] },
    { ar: 'سمر', latin: ['samar', 'samer'] },
    { ar: 'شهد', meaning: 'Honey', latin: ['shahad', 'shahd'] },
    { ar: 'شذى', meaning: 'Fragrance', latin: ['shatha', 'shadha'] },
    { ar: 'وفاء', meaning: 'Loyalty', latin: ['wafa', 'wafaa'] },
    { ar: 'زهرة', meaning: 'Blossom', latin: ['zahra', 'zahrah'] },
    { ar: 'زينب', latin: ['zainab', 'zaynab', 'zeinab'] },
    { ar: 'أسماء', latin: ['asma', 'asmaa'] },
    { ar: 'بشرى', meaning: 'Good news', latin: ['bushra', 'boushra'] },
    { ar: 'ديمة', meaning: 'Steady rain', latin: ['dima', 'deema', 'dema'] },
    { ar: 'فرح', meaning: 'Joy', latin: ['farah', 'farrah'] },
    { ar: 'غلا', meaning: 'Precious', latin: ['ghala', 'ghalaa'] },
    { ar: 'جوري', meaning: 'Damask rose', latin: ['jouri', 'joury', 'jori'] },
    { ar: 'جود', meaning: 'Generosity', latin: ['joud', 'jood'] },
    { ar: 'ملاك', meaning: 'Angel', latin: ['malak', 'malaak'] },
    { ar: 'مشاعل', meaning: 'Beacons', latin: ['mashael', 'mashail', 'mashaal'] },
    { ar: 'نوف', meaning: 'Summit', latin: ['nouf', 'noof'] },
    { ar: 'رغد', meaning: 'A life of ease', latin: ['raghad', 'raghd'] },
    { ar: 'روان', latin: ['rawan', 'rawaan'] },
    { ar: 'سديم', meaning: 'Nebula', latin: ['sadeem', 'sadim'] },
    { ar: 'أميرة', meaning: 'Princess', latin: ['amira', 'amirah', 'ameera'] },
    { ar: 'جميلة', meaning: 'Beautiful', latin: ['jamila', 'jameela', 'jamilah'] },
    { ar: 'سناء', meaning: 'Radiance', latin: ['sana', 'sanaa'] },
    { ar: 'وضحى', meaning: 'Bright', latin: ['wadha', 'wadhha'] },
    { ar: 'أريج', meaning: 'Fragrance', latin: ['areej', 'arij'] },
    { ar: 'عبير', meaning: 'Perfume', latin: ['abeer', 'abir'] },
    { ar: 'شادن', meaning: 'Young gazelle', latin: ['shaden', 'shadin'] },
    { ar: 'سندس', meaning: 'Fine silk', latin: ['sundus', 'sondos'] },
    { ar: 'يارا', latin: ['yara', 'yaraa'] },
    { ar: 'تالا', latin: ['tala', 'talaa'] },
    { ar: 'ريماس', latin: ['remas', 'rimas'] },
    { ar: 'إيلاف', latin: ['elaf', 'ilaf'] },
    { ar: 'هيا', latin: ['haya', 'hayaa'] },
    { ar: 'سها', latin: ['suha', 'soha'] },
    { ar: 'نادية', latin: ['nadia', 'nadya'] },
    { ar: 'خلود', meaning: 'Eternity', latin: ['kholoud', 'khulood'] },
    { ar: 'رؤى', meaning: 'Visions', latin: ['rua', 'ruaa', 'rouaa'] },
    { ar: 'لجين', meaning: 'Silver', latin: ['lujain', 'lujayn', 'lojain'] },
    { ar: 'غيداء', latin: ['ghaida', 'ghaidaa'] },
    { ar: 'بتول', latin: ['batool', 'batul'] },
    { ar: 'رقية', latin: ['ruqaya', 'ruqayya', 'rukaya'] },
    { ar: 'خديجة', latin: ['khadija', 'khadijah'] },
    { ar: 'حنان', meaning: 'Tenderness', latin: ['hanan', 'hanaan'] },
    { ar: 'سمية', latin: ['sumaya', 'sumayya', 'somaya'] },
    { ar: 'عهود', latin: ['ohoud', 'uhud'] },
    { ar: 'أفنان', meaning: 'Branches', latin: ['afnan', 'afnaan'] }
  ];

  /* Case, spacing, punctuation and doubled letters all collapse, so the many ways a guest
     might spell the same name land on one entry. */
  function normalise(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z]/g, '')
      .replace(/(.)\1+/g, '$1');
  }

  var byLatin = {}, byArabic = {};
  for (var i = 0; i < ENTRIES.length; i++) {
    var entry = ENTRIES[i];
    byArabic[entry.ar] = entry;
    for (var j = 0; j < entry.latin.length; j++) byLatin[normalise(entry.latin[j])] = entry;
  }

  /* Returns { ar, meaning } for a name we are sure about, or null.
     Null is a perfectly good answer: the poster then shows the Latin name alone. */
  function lookupName(value) {
    var raw = String(value || '').trim();
    if (!raw) return null;
    if (byArabic[raw]) return byArabic[raw];
    var hit = byLatin[normalise(raw)];
    return hit || null;
  }

  global.NameTable = { lookup: lookupName, size: ENTRIES.length };
})(typeof window !== 'undefined' ? window : globalThis);
