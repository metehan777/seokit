'use strict';

function extractPageContent() {
  var meta = extractMeta();
  var headings = extractHeadings();
  var body = extractBodyText();
  var links = extractLinks();
  var images = extractImages();
  var structured = extractStructuredData();

  return {
    url: window.location.href,
    meta: meta,
    headings: headings,
    bodyText: body.text,
    bodyTextLength: body.text.length,
    wordCountEstimate: body.text.split(/\s+/).filter(Boolean).length,
    paragraphs: body.paragraphs,
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
    var prop = ogEls[i].getAttribute('property');
    ogTags[prop] = ogEls[i].getAttribute('content') || '';
  }

  var twitterTags = {};
  var twEls = document.querySelectorAll('meta[name^="twitter:"]');
  for (var j = 0; j < twEls.length; j++) {
    var name = twEls[j].getAttribute('name');
    twitterTags[name] = twEls[j].getAttribute('content') || '';
  }

  var lang = document.documentElement.lang || '';
  var charset = document.characterSet || document.charset || '';
  var viewport = '';
  var vpEl = document.querySelector('meta[name="viewport"]');
  if (vpEl) viewport = vpEl.getAttribute('content') || '';

  return {
    title: title,
    titleLength: title.length,
    description: description,
    descriptionLength: description.length,
    keywords: keywords,
    canonical: canonical,
    robots: robots,
    og: ogTags,
    twitter: twitterTags,
    lang: lang,
    charset: charset,
    viewport: viewport
  };
}

function extractHeadings() {
  var result = { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] };
  for (var level = 1; level <= 6; level++) {
    var tag = 'h' + level;
    var els = document.querySelectorAll(tag);
    for (var i = 0; i < els.length; i++) {
      result[tag].push(els[i].textContent.trim());
    }
  }
  return result;
}

function extractBodyText() {
  var clone = document.body.cloneNode(true);
  var removeTags = ['script', 'style', 'noscript', 'iframe', 'svg', 'nav', 'footer', 'header'];
  for (var i = 0; i < removeTags.length; i++) {
    var els = clone.querySelectorAll(removeTags[i]);
    for (var j = els.length - 1; j >= 0; j--) {
      els[j].parentNode.removeChild(els[j]);
    }
  }

  var paragraphs = [];
  var pEls = clone.querySelectorAll('p, article, section, main, [role="main"]');
  for (var k = 0; k < pEls.length; k++) {
    var t = pEls[k].textContent.trim();
    if (t.length > 20) paragraphs.push(t);
  }

  var text = clone.textContent || '';
  text = text.replace(/\s+/g, ' ').trim();

  return { text: text, paragraphs: paragraphs };
}

function extractLinks() {
  var anchors = document.querySelectorAll('a[href]');
  var internal = 0;
  var external = 0;
  var nofollow = 0;
  var broken = [];
  var host = window.location.hostname;

  for (var i = 0; i < anchors.length; i++) {
    var href = anchors[i].getAttribute('href') || '';
    var rel = anchors[i].getAttribute('rel') || '';
    if (href.startsWith('#') || href.startsWith('javascript:')) continue;
    try {
      var url = new URL(href, window.location.origin);
      if (url.hostname === host) {
        internal++;
      } else {
        external++;
      }
    } catch (e) {
      broken.push(href);
    }
    if (rel.indexOf('nofollow') !== -1) nofollow++;
  }

  return {
    total: anchors.length,
    internal: internal,
    external: external,
    nofollow: nofollow,
    broken: broken
  };
}

function extractImages() {
  var imgs = document.querySelectorAll('img');
  var total = imgs.length;
  var withAlt = 0;
  var withoutAlt = 0;
  var missingAlt = [];

  for (var i = 0; i < imgs.length; i++) {
    var alt = imgs[i].getAttribute('alt');
    if (alt && alt.trim().length > 0) {
      withAlt++;
    } else {
      withoutAlt++;
      missingAlt.push(imgs[i].getAttribute('src') || '(no src)');
    }
  }

  return {
    total: total,
    withAlt: withAlt,
    withoutAlt: withoutAlt,
    missingAlt: missingAlt.slice(0, 20),
    altCoverage: total > 0 ? Math.round((withAlt / total) * 100) : 100
  };
}

function extractStructuredData() {
  var scripts = document.querySelectorAll('script[type="application/ld+json"]');
  var data = [];
  for (var i = 0; i < scripts.length; i++) {
    try {
      data.push(JSON.parse(scripts[i].textContent));
    } catch (e) { /* skip malformed JSON-LD */ }
  }
  return data;
}

module.exports = { extractPageContent: extractPageContent };
