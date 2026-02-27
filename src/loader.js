'use strict';

(function () {
  var VERSION = '1.0.0';
  var CACHE_NAME = 'seokit-v1';
  var _worker = null;
  var _results = null;
  var _ready = false;
  var _pendingCallbacks = [];
  var _options = {};
  var _engineUrl = '';
  var _workerUrl = '';

  function resolveAssetUrl(scriptEl, filename) {
    var explicit = scriptEl.getAttribute('data-seokit-base');
    if (explicit) return explicit.replace(/\/$/, '') + '/' + filename;
    var src = scriptEl.src || '';
    return src.substring(0, src.lastIndexOf('/') + 1) + filename;
  }

  function SEOKit(opts) {
    _options = assign({
      autoRun: true,
      showWidget: true,
      useWorker: true,
      onComplete: null
    }, opts || {});

    if (_options.autoRun) scheduleAnalysis();
  }

  SEOKit.prototype.run = function () { return runAnalysis(); };
  SEOKit.prototype.getResults = function () { return _results; };
  SEOKit.prototype.toJSON = function () { return JSON.stringify(_results, null, 2); };
  SEOKit.prototype.isReady = function () { return _ready; };
  SEOKit.prototype.onReady = function (fn) {
    if (_ready) fn(_results);
    else _pendingCallbacks.push(fn);
  };
  SEOKit.prototype.showWidget = function () { if (_results) renderWidget(_results); };
  SEOKit.prototype.hideWidget = function () { destroyWidget(); };
  SEOKit.prototype.destroy = function () { destroyWidget(); terminateWorker(); _results = null; _ready = false; };

  SEOKit.prototype.analyzeText = function (text) {
    return new Promise(function (resolve) {
      if (_worker) {
        var id = 'text_' + Date.now();
        var handler = function (e) {
          if (e.data && e.data.type === 'textResult' && e.data.id === id) {
            _worker.removeEventListener('message', handler);
            resolve(e.data.result);
          }
        };
        _worker.addEventListener('message', handler);
        _worker.postMessage({ type: 'analyzeText', text: text, id: id });
      } else {
        loadEngineFallback(function (engine) {
          resolve(engine.analyzeText(text));
        });
      }
    });
  };

  SEOKit.prototype.nlp = function () {
    console.warn('SEOKit: nlp() is only available in non-worker mode. Use analyzeText() instead.');
    return null;
  };

  // --- DOM Content Extraction (runs on main thread — needs DOM access) ---

  function extractPageContent() {
    var meta = extractMeta();
    var headings = extractHeadings();
    var body = extractBodyText();
    var links = extractLinks();
    var images = extractImages();
    var structured = extractStructuredData();
    var sections = extractSections();

    return {
      url: window.location.href,
      meta: meta,
      headings: headings,
      bodyText: body.text,
      bodyTextLength: body.text.length,
      wordCountEstimate: body.text.split(/\s+/).filter(Boolean).length,
      paragraphs: body.paragraphs,
      sections: sections,
      links: links,
      images: images,
      structuredData: structured,
      timestamp: Date.now()
    };
  }

  function extractMeta() {
    var title = document.title || '';
    var descEl = document.querySelector('meta[name="description"]');
    var description = descEl ? descEl.getAttribute('content') || '' : '';
    var keywordsEl = document.querySelector('meta[name="keywords"]');
    var keywords = keywordsEl ? keywordsEl.getAttribute('content') || '' : '';
    var canonical = '';
    var canonicalEl = document.querySelector('link[rel="canonical"]');
    if (canonicalEl) canonical = canonicalEl.getAttribute('href') || '';
    var robots = '';
    var robotsEl = document.querySelector('meta[name="robots"]');
    if (robotsEl) robots = robotsEl.getAttribute('content') || '';

    var ogTags = {};
    var ogEls = document.querySelectorAll('meta[property^="og:"]');
    for (var i = 0; i < ogEls.length; i++) {
      ogTags[ogEls[i].getAttribute('property')] = ogEls[i].getAttribute('content') || '';
    }

    var twitterTags = {};
    var twEls = document.querySelectorAll('meta[name^="twitter:"]');
    for (var j = 0; j < twEls.length; j++) {
      twitterTags[twEls[j].getAttribute('name')] = twEls[j].getAttribute('content') || '';
    }

    return {
      title: title, titleLength: title.length,
      description: description, descriptionLength: description.length,
      keywords: keywords, canonical: canonical, robots: robots,
      og: ogTags, twitter: twitterTags,
      lang: document.documentElement.lang || '',
      charset: document.characterSet || '',
      viewport: (document.querySelector('meta[name="viewport"]') || {}).content || ''
    };
  }

  function extractHeadings() {
    var r = { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] };
    for (var l = 1; l <= 6; l++) {
      var els = document.querySelectorAll('h' + l);
      for (var i = 0; i < els.length; i++) r['h' + l].push(els[i].textContent.trim());
    }
    return r;
  }

  function extractBodyText() {
    var clone = document.body.cloneNode(true);
    var tags = ['script', 'style', 'noscript', 'iframe', 'svg', 'nav', 'footer', 'header'];
    for (var i = 0; i < tags.length; i++) {
      var els = clone.querySelectorAll(tags[i]);
      for (var j = els.length - 1; j >= 0; j--) els[j].parentNode.removeChild(els[j]);
    }
    var paragraphs = [];
    var pEls = clone.querySelectorAll('p, article, section, main, [role="main"]');
    for (var k = 0; k < pEls.length; k++) {
      var t = pEls[k].textContent.trim();
      if (t.length > 20) paragraphs.push(t);
    }
    var text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    return { text: text, paragraphs: paragraphs };
  }

  function extractLinks() {
    var anchors = document.querySelectorAll('a[href]');
    var internal = 0, external = 0, nofollow = 0, broken = [];
    var host = window.location.hostname;
    for (var i = 0; i < anchors.length; i++) {
      var href = anchors[i].getAttribute('href') || '';
      var rel = anchors[i].getAttribute('rel') || '';
      if (href.charAt(0) === '#' || href.indexOf('javascript:') === 0) continue;
      try {
        var url = new URL(href, window.location.origin);
        if (url.hostname === host) internal++; else external++;
      } catch (e) { broken.push(href); }
      if (rel.indexOf('nofollow') !== -1) nofollow++;
    }
    return { total: anchors.length, internal: internal, external: external, nofollow: nofollow, broken: broken };
  }

  function extractImages() {
    var imgs = document.querySelectorAll('img');
    var withAlt = 0, withoutAlt = 0, missingAlt = [];
    for (var i = 0; i < imgs.length; i++) {
      var alt = imgs[i].getAttribute('alt');
      if (alt && alt.trim().length > 0) withAlt++;
      else { withoutAlt++; missingAlt.push(imgs[i].getAttribute('src') || '(no src)'); }
    }
    return { total: imgs.length, withAlt: withAlt, withoutAlt: withoutAlt, missingAlt: missingAlt.slice(0, 20), altCoverage: imgs.length > 0 ? Math.round((withAlt / imgs.length) * 100) : 100 };
  }

  function extractStructuredData() {
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    var data = [];
    for (var i = 0; i < scripts.length; i++) {
      try { data.push(JSON.parse(scripts[i].textContent)); } catch (e) {}
    }
    return data;
  }

  function extractSections() {
    var main = document.querySelector('main, article, [role="main"]') || document.body;
    var clone = main.cloneNode(true);
    var removeTags = ['script', 'style', 'noscript', 'iframe', 'svg', 'nav', 'footer'];
    for (var r = 0; r < removeTags.length; r++) {
      var rEls = clone.querySelectorAll(removeTags[r]);
      for (var rx = rEls.length - 1; rx >= 0; rx--) rEls[rx].parentNode.removeChild(rEls[rx]);
    }

    var sections = [];
    var headingSelector = 'h1, h2, h3, h4, h5, h6';
    var allHeadings = clone.querySelectorAll(headingSelector);

    if (allHeadings.length === 0) {
      var fullText = (clone.textContent || '').replace(/\s+/g, ' ').trim();
      if (fullText.length > 30) {
        sections.push({ heading: '', level: 0, text: fullText, wordCount: fullText.split(/\s+/).length });
      }
      return sections;
    }

    // Collect intro text before first heading
    var introText = collectTextBefore(clone, allHeadings[0]);
    if (introText.length > 30) {
      sections.push({ heading: '(Introduction)', level: 0, text: introText, wordCount: introText.split(/\s+/).length });
    }

    for (var h = 0; h < allHeadings.length; h++) {
      var hEl = allHeadings[h];
      var level = parseInt(hEl.tagName.charAt(1), 10);
      var headingText = hEl.textContent.trim();
      var nextH = h + 1 < allHeadings.length ? allHeadings[h + 1] : null;
      var sectionText = collectTextBetween(hEl, nextH);

      if (sectionText.length > 15) {
        sections.push({
          heading: headingText,
          level: level,
          text: sectionText,
          wordCount: sectionText.split(/\s+/).length
        });
      }
    }

    return sections;
  }

  function collectTextBefore(container, stopNode) {
    var text = '';
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while ((node = walker.nextNode())) {
      if (stopNode && stopNode.contains(node)) break;
      if (isBeforeInDOM(node, stopNode)) {
        var parent = node.parentNode;
        if (parent && !/^(SCRIPT|STYLE)$/i.test(parent.tagName)) {
          text += node.textContent;
        }
      }
    }
    return text.replace(/\s+/g, ' ').trim();
  }

  function collectTextBetween(startHeading, endHeading) {
    var text = '';
    var node = startHeading.nextSibling;
    while (node) {
      if (endHeading && node === endHeading) break;
      if (endHeading && node.contains && node.contains(endHeading)) break;
      if (/^H[1-6]$/i.test(node.nodeName)) break;
      if (node.nodeType === 3) {
        text += node.textContent;
      } else if (node.nodeType === 1) {
        var firstChildHeading = node.querySelector('h1,h2,h3,h4,h5,h6');
        if (firstChildHeading) {
          var pre = collectTextBefore(node, firstChildHeading);
          text += pre;
          break;
        }
        text += node.textContent;
      }
      node = node.nextSibling;
    }
    return text.replace(/\s+/g, ' ').trim();
  }

  function isBeforeInDOM(a, b) {
    if (!b) return true;
    return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  // --- Scheduling ---

  function scheduleAnalysis() {
    if (document.readyState === 'complete') { runWhenIdle(); return; }
    window.addEventListener('load', runWhenIdle);
  }

  function runWhenIdle() {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(function () { runAnalysis(); }, { timeout: 5000 });
    } else {
      setTimeout(runAnalysis, 100);
    }
  }

  // --- Worker Path ---

  function runAnalysis() {
    var startTime = performance.now();
    var pageContent = extractPageContent();

    if (_options.useWorker && typeof Worker !== 'undefined') {
      return runViaWorker(pageContent, startTime);
    }
    return runViaFallback(pageContent, startTime);
  }

  function runViaWorker(pageContent, startTime) {
    return new Promise(function (resolve) {
      try {
        _worker = new Worker(_workerUrl);
      } catch (e) {
        return resolve(runViaFallback(pageContent, startTime));
      }

      _worker.addEventListener('message', function onMsg(e) {
        if (e.data && e.data.type === 'analysisResult') {
          var results = e.data.result;
          results._performance = {
            analysisTime: Math.round(performance.now() - startTime),
            version: VERSION,
            mode: 'worker'
          };
          finalize(results);
          resolve(results);
        }
      });

      _worker.addEventListener('error', function () {
        terminateWorker();
        resolve(runViaFallback(pageContent, startTime));
      });

      _worker.postMessage({ type: 'analyze', pageContent: pageContent });
    });
  }

  // --- Fallback: dynamically load engine on main thread ---

  function runViaFallback(pageContent, startTime) {
    return new Promise(function (resolve) {
      loadEngineFallback(function (engine) {
        var results = engine.analyze(pageContent);
        results._performance = {
          analysisTime: Math.round(performance.now() - startTime),
          version: VERSION,
          mode: 'main-thread'
        };
        finalize(results);
        resolve(results);
      });
    });
  }

  var _engineModule = null;
  function loadEngineFallback(cb) {
    if (_engineModule) { cb(_engineModule); return; }
    var script = document.createElement('script');
    script.src = _engineUrl;
    script.async = true;
    script.setAttribute('fetchpriority', 'low');
    script.onload = function () {
      if (window.__SEOKitEngine) {
        _engineModule = window.__SEOKitEngine;
        cb(_engineModule);
      }
    };
    document.head.appendChild(script);
  }

  // --- Finalization ---

  function finalize(results) {
    _results = results;
    _ready = true;
    if (_options.showWidget) renderWidget(results);
    if (typeof _options.onComplete === 'function') _options.onComplete(results);
    for (var i = 0; i < _pendingCallbacks.length; i++) _pendingCallbacks[i](results);
    _pendingCallbacks = [];
  }

  function terminateWorker() {
    if (_worker) { _worker.terminate(); _worker = null; }
  }

  // --- Minimal Widget Renderer (inlined to keep loader self-contained) ---

  function renderWidget(r) {
    destroyWidget();
    var s = r.score;
    var gc = 'seokit-grade-' + s.grade.toLowerCase();

    var container = document.createElement('div');
    container.id = 'seokit-widget';
    container.innerHTML = '<div class="seokit-panel seokit-collapsed" id="seokit-panel">' +
      '<div class="seokit-fab" id="seokit-fab" title="SEOKit Analysis">' +
        '<div class="seokit-fab-score ' + gc + '">' + s.total + '</div>' +
        '<div class="seokit-fab-grade">' + s.grade + '</div>' +
      '</div>' +
      '<div class="seokit-body" id="seokit-body">' +
        '<div class="seokit-header"><div class="seokit-title">SEOKit Analysis</div><button class="seokit-close" id="seokit-close">&times;</button></div>' +
        '<div class="seokit-content">' +
          buildScoreHTML(s) +
          buildMetaHTML(r.meta) +
          buildReadabilityHTML(r.readability) +
          buildKeywordsHTML(r.keywords) +
          buildEntitiesHTML(r.entities) +
          buildSentimentHTML(r.sentiment) +
          buildStructureHTML(r.structure) +
          (r.chunks ? buildChunksHTML(r.chunks) : '') +
          buildRecsHTML(r.recommendations) +
        '</div>' +
        '<div class="seokit-footer">Powered by SEOKit &middot; 100% client-side</div>' +
      '</div>' +
    '</div>';

    var style = document.createElement('style');
    style.textContent = CSS;
    container.appendChild(style);
    document.body.appendChild(container);

    container.querySelector('#seokit-fab').addEventListener('click', function () {
      container.querySelector('#seokit-panel').classList.toggle('seokit-collapsed');
    });
    container.querySelector('#seokit-close').addEventListener('click', function () {
      container.querySelector('#seokit-panel').classList.add('seokit-collapsed');
    });
    var toggles = container.querySelectorAll('[data-seokit-toggle]');
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].addEventListener('click', function () {
        var body = this.nextElementSibling;
        var arrow = this.querySelector('.seokit-toggle-arrow');
        if (body.style.display === 'none') { body.style.display = 'block'; arrow.innerHTML = '\u25bc'; }
        else { body.style.display = 'none'; arrow.innerHTML = '\u25b6'; }
      });
    }
    var footer = container.querySelector('.seokit-footer');
    footer.style.cursor = 'pointer';
    footer.title = 'Click to copy JSON report';
    footer.addEventListener('click', function () {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(JSON.stringify(r, null, 2)).then(function () {
          footer.textContent = 'Copied!';
          setTimeout(function () { footer.textContent = 'Powered by SEOKit \u00b7 100% client-side'; }, 2000);
        });
      }
    });
  }

  function destroyWidget() {
    var el = document.getElementById('seokit-widget');
    if (el) el.parentNode.removeChild(el);
  }

  // --- Widget HTML Builders ---

  function sw(title, content) { return '<div class="seokit-section"><div class="seokit-section-title" data-seokit-toggle>' + title + ' <span class="seokit-toggle-arrow">\u25bc</span></div><div class="seokit-section-body">' + content + '</div></div>'; }
  function st(l, v) { return '<div class="seokit-stat"><div class="seokit-stat-val">' + v + '</div><div class="seokit-stat-label">' + l + '</div></div>'; }
  function ck(v, l) { return '<span class="seokit-check ' + (v ? 'seokit-check-pass' : 'seokit-check-fail') + '">' + (v ? '\u2713' : '\u2717') + ' ' + l + '</span>'; }
  function sb(l, v, m) { var p = Math.round((v / m) * 100); var c = p >= 80 ? 'good' : p >= 50 ? 'ok' : 'poor'; return '<div class="seokit-bar-row"><span class="seokit-bar-label">' + l + '</span><div class="seokit-bar"><div class="seokit-bar-fill seokit-bar-' + c + '" style="width:' + p + '%"></div></div><span class="seokit-bar-val">' + v + '/' + m + '</span></div>'; }
  function esc(s) { return s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''; }

  function buildScoreHTML(s) { var b = s.breakdown; return '<div class="seokit-section"><div class="seokit-score-ring"><div class="seokit-score-value seokit-grade-' + s.grade.toLowerCase() + '">' + s.total + '<span>/100</span></div></div><div class="seokit-score-bars">' + sb('Readability', b.readability, 25) + sb('Content', b.content, 25) + sb('Structure', b.structure, 25) + sb('Meta & Technical', b.meta, 25) + '</div></div>'; }

  function buildMetaHTML(m) {
    var ih = '';
    for (var i = 0; i < m.issues.length; i++) { var x = m.issues[i]; ih += '<div class="seokit-issue seokit-issue-' + x.severity + '"><span class="seokit-issue-dot"></span>' + esc(x.message) + '</div>'; }
    return sw('Meta Tags',
      '<div class="seokit-meta-item"><strong>Title:</strong> ' + esc(m.title || '(missing)') + ' <span class="seokit-dim">(' + m.titleLength + ' chars)</span></div>' +
      '<div class="seokit-meta-item"><strong>Description:</strong> ' + esc((m.description || '(missing)').substring(0, 100)) + '... <span class="seokit-dim">(' + m.descriptionLength + ' chars)</span></div>' +
      '<div class="seokit-meta-checks">' + ck(m.hasCanonical, 'Canonical URL') + ck(m.hasLang, 'Language') + ck(m.hasViewport, 'Viewport') + ck(m.hasOG, 'Open Graph') + ck(m.hasTwitterCard, 'Twitter Card') + '</div>' +
      (ih ? '<div class="seokit-issues">' + ih + '</div>' : ''));
  }

  function buildReadabilityHTML(r) {
    return sw('Readability', '<div class="seokit-stats-grid">' + st('Flesch Score', r.flesReadingEase !== null ? r.flesReadingEase : 'N/A') + st('Level', r.readingLevel) + st('Words', r.wordCount) + st('Sentences', r.sentenceCount) + st('Avg Words/Sent', r.avgWordsPerSentence) + st('Avg Word Length', r.avgWordLength) + st('Long Words', r.longWordPercentage + '%') + st('Reading Time', r.readingTime.minutes + 'm ' + r.readingTime.seconds + 's') + '</div>');
  }

  function buildKeywordsHTML(kw) {
    var h = '', bh = '';
    for (var i = 0; i < Math.min(kw.topKeywords.length, 15); i++) { var k = kw.topKeywords[i]; h += '<span class="seokit-kw" title="' + k.count + ' (' + k.density + '%)">' + esc(k.term) + ' <sup>' + k.count + '</sup></span> '; }
    for (var j = 0; j < Math.min(kw.topBigrams.length, 8); j++) { var b = kw.topBigrams[j]; bh += '<span class="seokit-kw seokit-kw-bi">' + esc(b.term) + ' <sup>' + b.count + '</sup></span> '; }
    return sw('Keywords', '<div class="seokit-stats-grid">' + st('Content Words', kw.totalContentWords) + st('Unique Words', kw.uniqueWords) + st('Lexical Diversity', kw.lexicalDiversity + '%') + '</div><div class="seokit-kw-cloud"><strong>Top Keywords:</strong><br>' + h + '</div>' + (bh ? '<div class="seokit-kw-cloud"><strong>Key Phrases:</strong><br>' + bh + '</div>' : ''));
  }

  function buildEntitiesHTML(ent) {
    if (ent.total === 0) return sw('Entities', '<div class="seokit-dim">None</div>');
    var th = '', ih = '';
    var types = Object.keys(ent.typeSummary);
    for (var i = 0; i < types.length; i++) th += '<span class="seokit-entity-type">' + types[i] + ': ' + ent.typeSummary[types[i]] + '</span> ';
    for (var j = 0; j < Math.min(ent.items.length, 20); j++) ih += '<span class="seokit-entity" title="' + ent.items[j].type + '">' + esc(ent.items[j].value) + '</span> ';
    return sw('Entities (' + ent.total + ')', '<div class="seokit-entity-types">' + th + '</div><div class="seokit-entity-list">' + ih + '</div>');
  }

  function buildSentimentHTML(s) {
    var p = Math.round((s.overall + 1) * 50);
    return sw('Sentiment', '<div class="seokit-sentiment-meter"><div class="seokit-sentiment-bar"><div class="seokit-sentiment-marker" style="left:' + p + '%"></div></div><div class="seokit-sentiment-labels"><span>Negative</span><span>Neutral</span><span>Positive</span></div></div><div class="seokit-sentiment-val">' + s.label + ' (' + s.overall + ')</div>');
  }

  function buildStructureHTML(t) {
    return sw('Page Structure', '<div class="seokit-stats-grid">' + st('H1 Tags', t.h1Count) + st('Total Headings', t.totalHeadings) + st('Paragraphs', t.paragraphCount) + st('Internal Links', t.links.internal) + st('External Links', t.links.external) + st('Images', t.images.total) + st('Alt Coverage', t.images.altCoverage + '%') + st('Schema.org', t.hasStructuredData ? 'Yes' : 'No') + '</div>' + (t.h1Text.length > 0 ? '<div class="seokit-meta-item"><strong>H1:</strong> ' + esc(t.h1Text[0]) + '</div>' : ''));
  }

  function buildRecsHTML(recs) {
    if (recs.length === 0) return sw('Recommendations', '<div class="seokit-dim">No issues!</div>');
    var h = '';
    for (var i = 0; i < recs.length; i++) { var r = recs[i]; h += '<div class="seokit-rec seokit-rec-' + r.priority + '"><span class="seokit-rec-badge">' + r.priority + '</span> <span class="seokit-rec-cat">[' + r.category + ']</span> ' + esc(r.message) + '</div>'; }
    return sw('Recommendations (' + recs.length + ')', h);
  }

  function buildChunksHTML(chunks) {
    if (!chunks || !chunks.items || chunks.items.length === 0) return '';
    var sum = chunks.summary;
    var items = chunks.items;

    // Summary stats
    var sumHTML = '<div class="seokit-stats-grid">' +
      st('Chunks', sum.totalChunks) +
      st('Avg Score', sum.avgSnippetScore) +
      st('Strong', sum.strongChunks) +
      st('Weak', sum.weakChunks) +
    '</div>';

    // Visual chunk map — a bar for each chunk, colored by score
    var mapHTML = '<div class="seokit-chunk-map">';
    for (var i = 0; i < items.length; i++) {
      var c = items[i];
      var cls = c.snippetScore >= 70 ? 'good' : c.snippetScore >= 45 ? 'ok' : 'poor';
      var widthPct = Math.max(8, Math.min(100, Math.round((c.wordCount / 300) * 100)));
      mapHTML += '<div class="seokit-chunk-bar seokit-chunk-' + cls + '" style="width:' + widthPct + '%" title="' + esc(c.heading) + ' — Score: ' + c.snippetScore + ', Words: ' + c.wordCount + '">' +
        '<span class="seokit-chunk-score">' + c.snippetScore + '</span>' +
      '</div>';
    }
    mapHTML += '</div>';
    mapHTML += '<div class="seokit-chunk-legend"><span class="seokit-chunk-leg-item"><span class="seokit-chunk-dot seokit-chunk-good"></span>Strong (70+)</span><span class="seokit-chunk-leg-item"><span class="seokit-chunk-dot seokit-chunk-ok"></span>Moderate</span><span class="seokit-chunk-leg-item"><span class="seokit-chunk-dot seokit-chunk-poor"></span>Weak (&lt;45)</span></div>';

    // Detailed chunk list
    var listHTML = '';
    for (var j = 0; j < items.length; j++) {
      var ch = items[j];
      var gcls = 'seokit-grade-' + ch.snippetGrade.toLowerCase();

      var termsHTML = '';
      for (var t = 0; t < ch.topTerms.length; t++) {
        termsHTML += '<span class="seokit-kw">' + esc(ch.topTerms[t].term) + '</span> ';
      }

      var entHTML = '';
      for (var e = 0; e < Math.min(ch.entities.length, 5); e++) {
        entHTML += '<span class="seokit-entity">' + esc(ch.entities[e].value) + '</span> ';
      }

      var stmtHTML = '';
      for (var s = 0; s < ch.keyStatements.length; s++) {
        stmtHTML += '<div class="seokit-chunk-stmt">&ldquo;' + esc(ch.keyStatements[s]) + '&rdquo;</div>';
      }

      listHTML += '<div class="seokit-chunk-item">' +
        '<div class="seokit-chunk-head">' +
          '<span class="seokit-chunk-heading">' + (ch.level > 0 ? 'H' + ch.level + ': ' : '') + esc(ch.heading) + '</span>' +
          '<span class="seokit-chunk-badge ' + gcls + '">' + ch.snippetScore + '</span>' +
        '</div>' +
        '<div class="seokit-chunk-meta">' +
          '<span>' + ch.wordCount + ' words</span> · ' +
          '<span>' + ch.entityCount + ' entities</span> · ' +
          '<span>density ' + ch.entityDensity + '%</span> · ' +
          '<span>alignment ' + ch.topicAlignment + '%</span>' +
        '</div>' +
        (termsHTML ? '<div class="seokit-chunk-terms">' + termsHTML + '</div>' : '') +
        (entHTML ? '<div class="seokit-chunk-ents">' + entHTML + '</div>' : '') +
        (stmtHTML ? '<div class="seokit-chunk-stmts"><strong>Key statements:</strong>' + stmtHTML + '</div>' : '') +
      '</div>';
    }

    return sw('AI Chunk Analysis (' + sum.totalChunks + ')',
      '<div class="seokit-chunk-desc">How AI search engines and RAG systems see your content — each section scored for snippet potential.</div>' +
      sumHTML + mapHTML + listHTML
    );
  }

  // --- CSS (inlined in loader to avoid extra request) ---
  var CSS = '#seokit-widget{all:initial;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;line-height:1.5;color:#1a1a2e;position:fixed;z-index:2147483647}#seokit-widget *{box-sizing:border-box}.seokit-panel{position:fixed;bottom:20px;right:20px;z-index:2147483647}.seokit-fab{width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 24px rgba(102,126,234,.4);transition:transform .2s,box-shadow .2s}.seokit-fab:hover{transform:scale(1.1);box-shadow:0 6px 32px rgba(102,126,234,.6)}.seokit-fab-score{font-size:18px;font-weight:800;color:#fff;line-height:1}.seokit-fab-grade{font-size:10px;color:rgba(255,255,255,.85);text-transform:uppercase;letter-spacing:1px;font-weight:600}.seokit-body{display:block;position:fixed;bottom:92px;right:20px;width:380px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,.15);overflow:hidden;animation:seokit-slide .25s ease}.seokit-collapsed .seokit-body{display:none}@keyframes seokit-slide{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}.seokit-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff}.seokit-title{font-size:15px;font-weight:700;letter-spacing:.3px}.seokit-close{background:0;border:0;color:#fff;font-size:22px;cursor:pointer;padding:0 4px;opacity:.8}.seokit-close:hover{opacity:1}.seokit-content{overflow-y:auto;max-height:calc(100vh - 220px);padding:0}.seokit-section{border-bottom:1px solid #f0f0f5;padding:14px 20px}.seokit-section:last-child{border-bottom:0}.seokit-section-title{font-size:13px;font-weight:700;color:#667eea;cursor:pointer;user-select:none;display:flex;justify-content:space-between;align-items:center}.seokit-toggle-arrow{font-size:10px;color:#aaa}.seokit-section-body{margin-top:10px}.seokit-score-ring{text-align:center;margin-bottom:12px}.seokit-score-value{font-size:48px;font-weight:900;line-height:1}.seokit-score-value span{font-size:18px;color:#999;font-weight:400}.seokit-grade-a{color:#10b981}.seokit-grade-b{color:#3b82f6}.seokit-grade-c{color:#f59e0b}.seokit-grade-d{color:#f97316}.seokit-grade-f{color:#ef4444}.seokit-bar-row{display:flex;align-items:center;gap:8px;margin-bottom:6px}.seokit-bar-label{width:110px;font-size:11px;color:#666;text-align:right}.seokit-bar{flex:1;height:8px;background:#f0f0f5;border-radius:4px;overflow:hidden}.seokit-bar-fill{height:100%;border-radius:4px;transition:width .6s ease}.seokit-bar-good{background:#10b981}.seokit-bar-ok{background:#f59e0b}.seokit-bar-poor{background:#ef4444}.seokit-bar-val{width:40px;font-size:11px;color:#888;text-align:right}.seokit-stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.seokit-stat{text-align:center;padding:8px 4px;background:#f8f9ff;border-radius:8px}.seokit-stat-val{font-size:16px;font-weight:700;color:#1a1a2e}.seokit-stat-label{font-size:10px;color:#888;margin-top:2px}.seokit-meta-item{font-size:12px;margin-bottom:6px;word-break:break-word}.seokit-meta-checks{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.seokit-check{font-size:11px;padding:3px 8px;border-radius:12px;font-weight:600}.seokit-check-pass{background:#ecfdf5;color:#10b981}.seokit-check-fail{background:#fef2f2;color:#ef4444}.seokit-issues{margin-top:10px}.seokit-issue{font-size:11px;padding:6px 10px;border-radius:6px;margin-bottom:4px;display:flex;align-items:center;gap:6px}.seokit-issue-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}.seokit-issue-critical{background:#fef2f2;color:#991b1b}.seokit-issue-critical .seokit-issue-dot{background:#ef4444}.seokit-issue-warning{background:#fffbeb;color:#92400e}.seokit-issue-warning .seokit-issue-dot{background:#f59e0b}.seokit-issue-info{background:#eff6ff;color:#1e40af}.seokit-issue-info .seokit-issue-dot{background:#3b82f6}.seokit-kw-cloud{margin-top:10px}.seokit-kw{display:inline-block;padding:3px 8px;margin:2px;background:#f0f0ff;border-radius:12px;font-size:12px;color:#4338ca;cursor:default}.seokit-kw sup{font-size:9px;color:#888;margin-left:1px}.seokit-kw-bi{background:#f0fdf4;color:#166534}.seokit-entity-types{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.seokit-entity-type{font-size:11px;padding:2px 8px;background:#fef3c7;border-radius:10px;color:#92400e;font-weight:600}.seokit-entity-list{display:flex;flex-wrap:wrap;gap:4px}.seokit-entity{font-size:11px;padding:3px 8px;background:#ede9fe;border-radius:10px;color:#5b21b6}.seokit-sentiment-meter{margin-bottom:8px}.seokit-sentiment-bar{position:relative;height:12px;background:linear-gradient(90deg,#ef4444,#f59e0b,#10b981);border-radius:6px;overflow:visible}.seokit-sentiment-marker{position:absolute;top:-3px;width:4px;height:18px;background:#1a1a2e;border-radius:2px;transform:translateX(-2px)}.seokit-sentiment-labels{display:flex;justify-content:space-between;font-size:10px;color:#888;margin-top:4px}.seokit-sentiment-val{text-align:center;font-size:13px;font-weight:600;color:#1a1a2e;text-transform:capitalize}.seokit-rec{font-size:12px;padding:8px 12px;border-radius:8px;margin-bottom:4px;line-height:1.4}.seokit-rec-high{background:#fef2f2;color:#991b1b}.seokit-rec-medium{background:#fffbeb;color:#92400e}.seokit-rec-low{background:#f0f9ff;color:#1e40af}.seokit-rec-badge{display:inline-block;font-size:9px;text-transform:uppercase;font-weight:800;padding:1px 6px;border-radius:4px;letter-spacing:.5px;vertical-align:middle}.seokit-rec-high .seokit-rec-badge{background:#ef4444;color:#fff}.seokit-rec-medium .seokit-rec-badge{background:#f59e0b;color:#fff}.seokit-rec-low .seokit-rec-badge{background:#3b82f6;color:#fff}.seokit-rec-cat{font-size:10px;color:#888;font-weight:600}.seokit-footer{text-align:center;padding:10px;font-size:10px;color:#aaa;border-top:1px solid #f0f0f5}.seokit-dim{color:#aaa;font-size:12px}.seokit-chunk-desc{font-size:11px;color:#888;margin-bottom:10px;line-height:1.4}.seokit-chunk-map{display:flex;flex-wrap:wrap;gap:3px;margin:12px 0}.seokit-chunk-bar{height:24px;border-radius:4px;display:flex;align-items:center;justify-content:center;min-width:28px;transition:opacity .2s}.seokit-chunk-bar:hover{opacity:.8}.seokit-chunk-good{background:#d1fae5}.seokit-chunk-ok{background:#fef3c7}.seokit-chunk-poor{background:#fee2e2}.seokit-chunk-score{font-size:10px;font-weight:700;color:#1a1a2e}.seokit-chunk-legend{display:flex;gap:12px;justify-content:center;margin:6px 0 12px;font-size:10px;color:#888}.seokit-chunk-leg-item{display:flex;align-items:center;gap:3px}.seokit-chunk-dot{width:8px;height:8px;border-radius:50%}.seokit-chunk-dot.seokit-chunk-good{background:#10b981}.seokit-chunk-dot.seokit-chunk-ok{background:#f59e0b}.seokit-chunk-dot.seokit-chunk-poor{background:#ef4444}.seokit-chunk-item{border:1px solid #f0f0f5;border-radius:10px;padding:10px 12px;margin-bottom:8px}.seokit-chunk-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}.seokit-chunk-heading{font-size:12px;font-weight:700;color:#1a1a2e;flex:1;margin-right:8px}.seokit-chunk-badge{font-size:13px;font-weight:800;flex-shrink:0}.seokit-chunk-meta{font-size:10px;color:#888;margin-bottom:6px}.seokit-chunk-terms{margin:4px 0}.seokit-chunk-ents{margin:4px 0}.seokit-chunk-stmts{margin-top:6px;font-size:11px;color:#555}.seokit-chunk-stmt{padding:4px 8px;background:#f8f9ff;border-radius:6px;margin-top:3px;font-style:italic;line-height:1.35}@media(max-width:440px){.seokit-body{width:calc(100vw - 24px);right:12px;bottom:84px}.seokit-stats-grid{grid-template-columns:repeat(2,1fr)}}';

  function assign(target, source) {
    for (var key in source) { if (source.hasOwnProperty(key)) target[key] = source[key]; }
    return target;
  }

  // --- Auto-init ---
  if (typeof window !== 'undefined') {
    window.SEOKit = SEOKit;

    var scripts = document.querySelectorAll('script[data-seokit]');
    if (scripts.length > 0) {
      var scriptEl = scripts[scripts.length - 1];
      _workerUrl = resolveAssetUrl(scriptEl, 'seokit-worker.min.js');
      _engineUrl = resolveAssetUrl(scriptEl, 'seokit-engine.min.js');

      var autoOpts = {};
      if (scriptEl.getAttribute('data-seokit-widget') === 'false') autoOpts.showWidget = false;
      if (scriptEl.getAttribute('data-seokit-auto') === 'false') autoOpts.autoRun = false;
      if (scriptEl.getAttribute('data-seokit-worker') === 'false') autoOpts.useWorker = false;

      window.seokit = new SEOKit(autoOpts);
    }
  }
})();
