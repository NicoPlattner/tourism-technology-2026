/* Paznaun-Ischgl fan page — content and a few lines of behaviour.
   Everything lives in this file so the page stays easy to read and edit. */
(function () {
  'use strict';

  // ---------- photos (Wikimedia Commons, see footer credits)
  var C = 'https://upload.wikimedia.org/wikipedia/commons/thumb/';
  var photos = {
    idalp: { src: C + '0/08/Idalp_2020.jpg/1920px-Idalp_2020.jpg', title: 'Idalp 2020', by: 'Thomas Dahlstrøm Nielsen', lic: 'CC BY-SA 4.0', file: 'Idalp_2020.jpg' },
    ischglSummer: { src: C + '5/52/Ischgl_01.jpg/1920px-Ischgl_01.jpg', title: 'Ischgl 01', by: 'Basotxerri', lic: 'CC BY-SA 4.0', file: 'Ischgl_01.jpg' },
    slopes: { src: C + '9/9e/Ischgl%2C_Austria_05.jpg/960px-Ischgl%2C_Austria_05.jpg', title: 'Ischgl, Austria 05', by: 'Staselnik', lic: 'CC BY-SA 3.0', file: 'Ischgl,_Austria_05.jpg' },
    idalpOverview: { src: C + '8/8c/Overview_Idalp%2C_Ischgl%2C_2023.jpg/960px-Overview_Idalp%2C_Ischgl%2C_2023.jpg', title: 'Overview Idalp, Ischgl, 2023', by: 'Thomas Dahlstrøm Nielsen', lic: 'CC BY 4.0', file: 'Overview_Idalp,_Ischgl,_2023.jpg' },
    snowboard: { src: C + '1/1f/Snowboarding_in_ischgl_%D7%92%D7%9C%D7%99%D7%A9%D7%94_%D7%91%D7%92%D7%9C%D7%A9%D7%9F_%D7%A9%D7%9C%D7%92_%D7%91%D7%90%D7%99%D7%A9%D7%92%D7%99%D7%9C.jpg/960px-Snowboarding_in_ischgl_%D7%92%D7%9C%D7%99%D7%A9%D7%94_%D7%91%D7%92%D7%9C%D7%A9%D7%9F_%D7%A9%D7%9C%D7%92_%D7%91%D7%90%D7%99%D7%A9%D7%92%D7%99%D7%9C.jpg', title: 'Snowboarding in Ischgl', by: 'Yuval perez', lic: 'CC BY-SA 4.0', file: 'Snowboarding_in_ischgl_%D7%92%D7%9C%D7%99%D7%A9%D7%94_%D7%91%D7%92%D7%9C%D7%A9%D7%9F_%D7%A9%D7%9C%D7%92_%D7%91%D7%90%D7%99%D7%A9%D7%92%D7%99%D7%9C.jpg' },
    gondola: { src: C + 'b/b6/Fimba-_und_Silvrettabahn_Ischgl.jpg/960px-Fimba-_und_Silvrettabahn_Ischgl.jpg', title: 'Fimba- und Silvrettabahn Ischgl', by: 'Gast32', lic: 'CC BY-SA 3.0', file: 'Fimba-_und_Silvrettabahn_Ischgl.jpg' },
    galturWinter: { src: C + '3/37/Galt%C3%BCr_im_Winter.jpg/960px-Galt%C3%BCr_im_Winter.jpg', title: 'Galtür im Winter', by: 'Tourismusverband Paznaun/Ischgl', lic: 'Attribution', file: 'Galt%C3%BCr_im_Winter.jpg' },
    jamtalWinter: { src: C + '1/19/Jamtalh%C3%BCtte_winter.jpg/960px-Jamtalh%C3%BCtte_winter.jpg', title: 'Jamtalhütte winter', by: 'Stefan.straub', lic: 'CC BY-SA 4.0', file: 'Jamtalh%C3%BCtte_winter.jpg' },
    idalpCrowd: { src: C + '0/08/Panorama_Ischgl_Idalp.jpg/960px-Panorama_Ischgl_Idalp.jpg', title: 'Panorama Ischgl Idalp', by: 'Gürkan Sengün', lic: 'Public domain', file: 'Panorama_Ischgl_Idalp.jpg' },
    village: { src: C + '1/18/Ischgl%2C_Austria_04.jpg/960px-Ischgl%2C_Austria_04.jpg', title: 'Ischgl, Austria 04', by: 'Staselnik', lic: 'CC BY-SA 3.0', file: 'Ischgl,_Austria_04.jpg' },
    schmarrn: { src: C + '6/6b/Kaiserschmarrn_at_Tallner_Alm_Kaser_Meran.jpg/960px-Kaiserschmarrn_at_Tallner_Alm_Kaser_Meran.jpg', title: 'Kaiserschmarrn (illustrative, not taken in Paznaun)', by: 'Marie-Lan Taÿ Pamart', lic: 'CC BY 4.0', file: 'Kaiserschmarrn_at_Tallner_Alm_Kaser_Meran.jpg' },
    fimbatal: { src: C + '9/9d/Heidelberger_H%C3%BCtte_and_Fimbabach.JPG/960px-Heidelberger_H%C3%BCtte_and_Fimbabach.JPG', title: 'Heidelberger Hütte and Fimbabach', by: 'trldp', lic: 'CC BY-SA 4.0', file: 'Heidelberger_H%C3%BCtte_and_Fimbabach.JPG' },
    bridge: { src: C + 'b/b8/Ischgl_-_H%C3%A4ngebr%C3%BCcke_B%C3%A4renfalle_01.jpg/960px-Ischgl_-_H%C3%A4ngebr%C3%BCcke_B%C3%A4renfalle_01.jpg', title: 'Ischgl - Hängebrücke Bärenfalle 01', by: 'Basotxerri', lic: 'CC BY-SA 4.0', file: 'Ischgl_-_H%C3%A4ngebr%C3%BCcke_B%C3%A4renfalle_01.jpg' },
    trail: { src: C + 'c/c7/Ischgl_-_Wanderweg_01.jpg/960px-Ischgl_-_Wanderweg_01.jpg', title: 'Ischgl - Wanderweg 01', by: 'Basotxerri', lic: 'CC BY-SA 4.0', file: 'Ischgl_-_Wanderweg_01.jpg' },
    road: { src: C + 'd/de/Silvretta-Hochalpenstrasse_03.jpg/960px-Silvretta-Hochalpenstrasse_03.jpg', title: 'Silvretta-Hochalpenstrasse 03', by: 'Basotxerri', lic: 'CC BY-SA 4.0', file: 'Silvretta-Hochalpenstrasse_03.jpg' },
    lake: { src: C + '0/06/Silvrettasee.jpg/960px-Silvrettasee.jpg', title: 'Silvrettasee', by: 'Vince51', lic: 'CC BY 3.0', file: 'Silvrettasee.jpg' },
    jamtal: { src: C + 'b/b2/Jamtalh%C3%BCtte.jpg/960px-Jamtalh%C3%BCtte.jpg', title: 'Jamtalhütte', by: 'Whgler', lic: 'CC BY-SA 3.0', file: 'Jamtalh%C3%BCtte.jpg' },
    alpinarium: { src: C + 'c/c4/Galt%C3%BCr_-_Alpinarium_01.jpg/960px-Galt%C3%BCr_-_Alpinarium_01.jpg', title: 'Galtür - Alpinarium 01', by: 'Basotxerri', lic: 'CC BY-SA 4.0', file: 'Galt%C3%BCr_-_Alpinarium_01.jpg' },
    kappl: { src: C + 'f/fd/Kappl_-_Bergstation_Diasbahn_01.jpg/960px-Kappl_-_Bergstation_Diasbahn_01.jpg', title: 'Kappl - Bergstation Diasbahn 01', by: 'Basotxerri', lic: 'CC BY-SA 4.0', file: 'Kappl_-_Bergstation_Diasbahn_01.jpg' },
    mathon: { src: C + 'f/f9/Mathon-Hang.jpg/960px-Mathon-Hang.jpg', title: 'Mathon-Hang', by: 'FkMohr', lic: 'CC BY-SA 3.0 de', file: 'Mathon-Hang.jpg' },
    galturSummer: { src: C + 'a/ac/Galt%C3%BCr_-_Ortszentrum_01.jpg/960px-Galt%C3%BCr_-_Ortszentrum_01.jpg', title: 'Galtür - Ortszentrum 01', by: 'Basotxerri', lic: 'CC BY-SA 4.0', file: 'Galt%C3%BCr_-_Ortszentrum_01.jpg' },
    heidelberger: { src: C + 'b/b8/Heidelberger_H%C3%BCtte_2014a.jpg/960px-Heidelberger_H%C3%BCtte_2014a.jpg', title: 'Heidelberger Hütte 2014a', by: 'Whgler', lic: 'CC BY 4.0', file: 'Heidelberger_H%C3%BCtte_2014a.jpg' }
  };

  // ---------- interests
  var interests = [
    { id: 'active', label: 'Active' },
    { id: 'nature', label: 'Nature' },
    { id: 'family', label: 'Family' },
    { id: 'food', label: 'Food & culture' },
    { id: 'events', label: 'Events & après' }
  ];

  // ---------- things to do, by season
  var seasons = {
    winter: {
      hero: 'idalp',
      lead: 'Late November to early May: one of the biggest ski areas in the Alps, quiet winter villages and concerts on the mountain.',
      title: 'Winter in the Paznaun',
      items: [
        { i: 'active', where: 'Ischgl ⇄ Samnaun', photo: 'slopes', title: 'Ski the Silvretta Arena', text: '239 km of slopes linked across the Swiss border, most of them above 2,000 m. Snow-sure from late November into May.' },
        { i: 'active', where: 'Off the marked runs', photo: 'snowboard', title: 'Freeride & snowboard', text: 'Wide open bowls between the pistes. Go with a local guide and full avalanche gear — never alone.' },
        { i: 'nature', where: 'Galtür, Jamtal', photo: 'jamtalWinter', title: 'Ski touring in the Jamtal', text: 'A classic touring valley with the Jamtalhütte as a base and glaciers all around. Guided tours start in Galtür.' },
        { i: 'family', where: 'Ischgl, from the Idalp', photo: 'gondola', title: 'Night tobogganing', text: 'Ride the Silvrettabahn up, then 7 km and 950 m of descent back to the village. Open on selected evenings only.' },
        { i: 'family', where: 'Galtür', photo: 'galturWinter', title: 'Easy days in Galtür', text: 'The quiet, high village at 1,584 m: winter walking paths, cross-country tracks and gentle slopes for beginners.' },
        { i: 'food', where: 'Samnaun, Switzerland', photo: 'idalpOverview', title: 'Ski over to duty-free Samnaun', text: 'Cross the border on skis for lunch and a little tax-free shopping, then ski back to Ischgl the same afternoon.' },
        { i: 'food', where: 'On the mountain', photo: 'schmarrn', title: 'Lunch with a view', text: 'Kaiserschmarrn, Kasspatzln and Gröstl on a sunny hut terrace. Ischgl also has a serious fine-dining scene.' },
        { i: 'events', where: 'Ischgl', photo: 'idalpCrowd', title: 'Top of the Mountain concerts', text: 'Big-name concerts open and close the season. 2026/27 starts with Westlife on 28 November; a valid ski pass is your ticket.' },
        { i: 'events', where: 'Ischgl village', photo: 'village', title: 'Après-ski', text: 'Ischgl is famous for it. One drink after the last run, or a long night — the village is built for both.' }
      ]
    },
    summer: {
      hero: 'ischglSummer',
      lead: 'July to September: green side valleys, hut-to-hut hikes, mountain bike trails and high alpine roads.',
      title: 'Summer in the Paznaun',
      items: [
        { i: 'nature', where: 'Ischgl, Fimbatal', photo: 'fimbatal', title: 'Hike the Fimbatal', text: 'A wide, gentle side valley up to the Heidelberger Hütte (2,264 m) — a German Alpine Club hut that actually stands on Swiss soil.' },
        { i: 'nature', where: 'Bielerhöhe, 2,030 m', photo: 'lake', title: 'Walk around Silvretta Lake', text: 'A turquoise reservoir below Piz Buin. The loop around it takes about two hours and stays almost flat.' },
        { i: 'active', where: 'Ischgl ⇄ Samnaun', photo: 'trail', title: 'Mountain biking', text: 'Summer lifts carry bikes up; forest trails and old smugglers’ paths lead across the border to Samnaun.' },
        { i: 'active', where: 'Galtür → Bielerhöhe', photo: 'road', title: 'Ride the Silvretta High Alpine Road', text: 'The famous pass road with 34 hairpins — great by bike, car or motorbike. Summer only, toll road.' },
        { i: 'family', where: 'Near Ischgl', photo: 'bridge', title: 'Suspension-bridge walk', text: 'Forest paths outside the village lead over a long suspension bridge across a gorge. Short, safe and exciting for kids.' },
        { i: 'family', where: 'Kappl', photo: 'kappl', title: 'Kappl’s sunny mountain', text: 'Take the Diasbahn up to the alpine meadows above Kappl: short walks, a hut stop and wide views down the valley.' },
        { i: 'food', where: 'Mountain huts in the valley', photo: 'jamtal', title: 'The Culinary Way of St. James', text: 'Each summer, top chefs create one dish for a mountain hut. You hike or bike there to eat it.' },
        { i: 'food', where: 'Galtür', photo: 'alpinarium', title: 'Alpinarium Galtür', text: 'Museum and avalanche wall in one, built after the 1999 avalanche. Thoughtful, modern and worth an hour.' },
        { i: 'events', where: 'Ischgl', photo: 'mathon', title: 'Ischgl Ironbike', text: 'The valley’s big mountain bike race in early August, with marathon routes and a short track race in the village.' }
      ]
    }
  };

  // ---------- blog
  var posts = [
    {
      slug: 'first-week-of-the-season', date: '2026-11-05', photo: 'idalp',
      title: 'Why we love the first week of the season',
      excerpt: 'The lifts open on 26 November. Here is why we always try to be there early.',
      body: [
        'Every year we circle the opening date in the calendar. For 2026/27 the lifts in the Silvretta Arena start on Thursday, 26 November, and the season is planned to run until 2 May 2027.',
        'Our three reasons for going early:',
        ['The slopes are quiet. Most people arrive for Christmas, so late November feels like having the mountain to yourself.', 'The light. Low winter sun over the Idalp is the best photo spot of the whole season.', 'The opening concert. On Saturday, 28 November, Westlife play the Top of the Mountain Opening Concert — and a valid ski pass gets you in.'],
        'Tip: book a few days rather than just the weekend. The snow is often best from Monday on, when the crowds have gone home.'
      ]
    },
    {
      slug: 'galtur-the-quiet-one', date: '2026-10-18', photo: 'galturSummer',
      title: 'Galtür, the quiet one',
      excerpt: 'A quarter of an hour up the valley from Ischgl, the mood changes completely.',
      body: [
        'Ischgl gets the headlines, but our favourite morning coffee happens in Galtür. At 1,584 m it is the highest village in the valley, and it feels calmer and wider than anywhere else.',
        'In summer we start hikes into the Jamtal from here. In winter, Galtür is where we go for cross-country skiing, winter walks and our first ski-touring steps with a guide.',
        'Don’t skip the Alpinarium. It was built after the avalanche of 1999 and is both a protective wall and a museum about living with the mountains. It is a calm, moving place.'
      ]
    },
    {
      slug: 'a-day-on-the-culinary-way', date: '2026-09-02', photo: 'heidelberger',
      title: 'A day on the Culinary Way',
      excerpt: 'Hiking for lunch: how we ate our way up the Fimbatal.',
      body: [
        'The idea is simple: each summer, well-known chefs each create one dish for a mountain hut in the Paznaun. The dish stays on the menu all season, and you have to walk (or bike) to get it.',
        'We picked the Heidelberger Hütte at the end of the Fimbatal. The walk from Ischgl is long but never steep, following the stream almost all the way. Fun fact: the hut is run by a German alpine club section but stands just across the border in Switzerland.',
        'After three hours on foot, a plate of regional food and a cold drink on the terrace is about as good as summer gets. The bus or a bike makes the way back easier.'
      ]
    },
    {
      slug: 'summer-hike-packing-list', date: '2026-07-14', photo: 'trail',
      title: 'Our packing list for a Paznaun summer hike',
      excerpt: 'Short and practical — what is always in our backpack.',
      body: [
        'The valley floor is around 1,000–1,600 m, but most good hikes end well above 2,000 m. The weather up there changes fast, so we pack for it:',
        ['A rain jacket and a warm layer, even on hot days', 'Sun cream and sunglasses — the sun is strong at altitude', 'At least one litre of water per person', 'Proper hiking shoes with grip', 'Cash for the huts, just in case', 'Your guest card: in many accommodations it includes summer lifts and buses'],
        'And one rule: start early. Afternoon thunderstorms are common in July and August.'
      ]
    }
  ];

  // ---------- state & helpers
  var state = { season: defaultSeason(), interest: 'all' };
  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  function defaultSeason() {
    var m = new Date().getMonth(); // 0 = Jan
    return m >= 4 && m <= 9 ? 'summer' : 'winter'; // May–Oct summer, Nov–Apr winter
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function fmtDate(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function label(id) {
    for (var k = 0; k < interests.length; k++) if (interests[k].id === id) return interests[k].label;
    return id;
  }

  // ---------- rendering
  function renderSeason() {
    var s = seasons[state.season];
    document.body.setAttribute('data-season', state.season);
    $$('.seasons button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-season') === state.season)); });
    $('#hero-lead').textContent = s.lead;
    $('#explore-title').textContent = s.title;

    var img = $('#hero-img');
    var next = photos[s.hero].src;
    if (img.getAttribute('src') !== next) {
      if (!img.getAttribute('src')) { img.src = next; }
      else {
        img.classList.add('fading');
        setTimeout(function () { img.src = next; img.onload = function () { img.classList.remove('fading'); }; }, 250);
      }
    }
    renderChips();
    renderCards();
  }

  function renderChips() {
    var items = seasons[state.season].items;
    var html = chip('all', 'All', items.length);
    interests.forEach(function (it) {
      var n = items.filter(function (x) { return x.i === it.id; }).length;
      if (n) html += chip(it.id, it.label, n);
    });
    $('#chips').innerHTML = html;
    function chip(id, text, n) {
      return '<button type="button" class="chip" data-interest="' + id + '" aria-pressed="' + (state.interest === id) + '">' + esc(text) + '<span class="n">' + n + '</span></button>';
    }
  }

  function renderCards() {
    var items = seasons[state.season].items.filter(function (x) { return state.interest === 'all' || x.i === state.interest; });
    if (!items.length) { $('#cards').innerHTML = '<p class="empty">Nothing in this category this season.</p>'; return; }
    $('#cards').innerHTML = items.map(function (x) {
      var p = photos[x.photo];
      return '<article class="card">' +
        '<div class="ph"><img loading="lazy" src="' + p.src + '" alt="' + esc(x.title) + '" /></div>' +
        '<div class="meta"><span class="pill">' + esc(label(x.i)) + '</span><span>' + esc(x.where) + '</span></div>' +
        '<h3>' + esc(x.title) + '</h3><p>' + esc(x.text) + '</p></article>';
    }).join('');
  }

  function renderPosts() {
    $('#posts').innerHTML = posts.map(function (p) {
      return '<a class="post" href="#/blog/' + p.slug + '">' +
        '<img loading="lazy" src="' + photos[p.photo].src + '" alt="" />' +
        '<div><time datetime="' + p.date + '">' + fmtDate(p.date) + '</time><h3>' + esc(p.title) + '</h3><p>' + esc(p.excerpt) + '</p></div></a>';
    }).join('');
  }

  function renderArticle(slug) {
    var idx = posts.findIndex(function (p) { return p.slug === slug; });
    if (idx < 0) return false;
    var p = posts[idx];
    var next = posts[(idx + 1) % posts.length];
    var body = p.body.map(function (b) {
      return Array.isArray(b) ? '<ul>' + b.map(function (li) { return '<li>' + esc(li) + '</li>'; }).join('') + '</ul>' : '<p>' + esc(b) + '</p>';
    }).join('');
    $('#article').innerHTML =
      '<a class="back" href="#blog">← All blog posts</a>' +
      '<p class="eyebrow">Fan blog · <time datetime="' + p.date + '">' + fmtDate(p.date) + '</time></p>' +
      '<h1>' + esc(p.title) + '</h1>' +
      '<img class="cover" src="' + photos[p.photo].src + '" alt="" />' +
      '<div class="body">' + body + '</div>' +
      '<p class="next">Next: <a href="#/blog/' + next.slug + '">' + esc(next.title) + '</a></p>';
    return true;
  }

  function renderCredits() {
    var seen = {};
    $('#credits').innerHTML = Object.keys(photos).map(function (k) {
      var p = photos[k];
      if (seen[p.file]) return '';
      seen[p.file] = true;
      return '<li><a href="https://commons.wikimedia.org/wiki/File:' + p.file + '" rel="noopener">' + esc(p.title) + '</a> — ' + esc(p.by) + ', ' + esc(p.lic) + '</li>';
    }).join('');
  }

  // ---------- routing: #/blog/<slug> shows a post, every other hash is the home page
  function route() {
    var h = location.hash;
    var m = h.match(/^#\/blog\/([\w-]+)$/);
    if (m && renderArticle(m[1])) {
      $('#home').hidden = true;
      $('#article').hidden = false;
      window.scrollTo(0, 0);
      document.title = $('#article h1').textContent + ' · Paznaun-Ischgl Fan Page';
      return;
    }
    var wasHidden = $('#home').hidden;
    $('#home').hidden = false;
    $('#article').hidden = true;
    document.title = 'Paznaun-Ischgl Fan Page · unofficial';
    if (wasHidden) {
      var target = h && h.length > 1 ? document.getElementById(h.slice(1)) : null;
      if (target) target.scrollIntoView(); else window.scrollTo(0, 0);
    }
  }

  // ---------- events
  document.addEventListener('click', function (e) {
    var s = e.target.closest('[data-season]');
    if (s && s.tagName === 'BUTTON') {
      state.season = s.getAttribute('data-season');
      state.interest = 'all';
      renderSeason();
      return;
    }
    var c = e.target.closest('[data-interest]');
    if (c) {
      state.interest = c.getAttribute('data-interest');
      renderChips();
      renderCards();
    }
  });
  window.addEventListener('hashchange', route);
  // A photo that fails to load leaves a calm grey block instead of a broken icon.
  document.addEventListener('error', function (e) {
    if (e.target.tagName === 'IMG') e.target.style.visibility = 'hidden';
  }, true);
  document.addEventListener('load', function (e) {
    if (e.target.tagName === 'IMG') e.target.style.visibility = '';
  }, true);

  // ---------- consent banner: Google Tag Manager loads only after "Accept"
  var KEY = 'fanpage-consent';
  function storedConsent() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function showConsent(show) { $('#consent').hidden = !show; }
  $('#consent').addEventListener('click', function (e) {
    var b = e.target.closest('[data-consent]');
    if (!b) return;
    var choice = b.getAttribute('data-consent');
    try { localStorage.setItem(KEY, choice); } catch (err) { /* choice applies to this visit only */ }
    if (choice === 'granted') window.loadGoogleTag();
    else if (window.googleTagLoaded) {
      // Already loaded earlier in this visit: withdraw consent now; GTM is not loaded on later visits.
      window.gtag('consent', 'update', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' });
    }
    showConsent(false);
  });
  $('#consent-open').addEventListener('click', function () { showConsent(true); });
  if (!storedConsent()) showConsent(true);

  renderSeason();
  renderPosts();
  renderCredits();
  route();
})();
