'use strict';

var WIDGET_ID = 'seokit-widget';

function createWidget(results) {
  var existing = document.getElementById(WIDGET_ID);
  if (existing) existing.parentNode.removeChild(existing);

  var container = document.createElement('div');
  container.id = WIDGET_ID;
  container.innerHTML = buildHTML(results);

  var style = document.createElement('style');
  style.textContent = getCSS();
  container.appendChild(style);

  document.body.appendChild(container);
  bindEvents(container, results);
}

function destroyWidget() {
  var el = document.getElementById(WIDGET_ID);
  if (el) el.parentNode.removeChild(el);
}

function buildHTML(r) {
  var score = r.score;
  var gradeClass = 'seokit-grade-' + score.grade.toLowerCase();

  return '' +
    '<div class="seokit-panel seokit-collapsed" id="seokit-panel">' +
      '<div class="seokit-fab" id="seokit-fab" title="SEOKit Analysis">' +
        '<div class="seokit-fab-score ' + gradeClass + '">' + score.total + '</div>' +
        '<div class="seokit-fab-grade">' + score.grade + '</div>' +
      '</div>' +
      '<div class="seokit-body" id="seokit-body">' +
        '<div class="seokit-header">' +
          '<div class="seokit-title">SEOKit Analysis</div>' +
          '<button class="seokit-close" id="seokit-close">&times;</button>' +
        '</div>' +
        '<div class="seokit-content">' +
          buildScoreSection(score) +
          buildMetaSection(r.meta) +
          buildReadabilitySection(r.readability) +
          buildKeywordsSection(r.keywords) +
          buildEntitiesSection(r.entities) +
          buildSentimentSection(r.sentiment) +
          buildStructureSection(r.structure) +
          buildRecommendationsSection(r.recommendations) +
        '</div>' +
        '<div class="seokit-footer">Powered by SEOKit &middot; 100% client-side</div>' +
      '</div>' +
    '</div>';
}

function buildScoreSection(score) {
  var b = score.breakdown;
  return '' +
    '<div class="seokit-section">' +
      '<div class="seokit-score-ring">' +
        '<div class="seokit-score-value seokit-grade-' + score.grade.toLowerCase() + '">' + score.total + '<span>/100</span></div>' +
      '</div>' +
      '<div class="seokit-score-bars">' +
        scoreBar('Readability', b.readability, 25) +
        scoreBar('Content', b.content, 25) +
        scoreBar('Structure', b.structure, 25) +
        scoreBar('Meta & Technical', b.meta, 25) +
      '</div>' +
    '</div>';
}

function scoreBar(label, value, max) {
  var pct = Math.round((value / max) * 100);
  var cls = pct >= 80 ? 'good' : pct >= 50 ? 'ok' : 'poor';
  return '<div class="seokit-bar-row">' +
    '<span class="seokit-bar-label">' + label + '</span>' +
    '<div class="seokit-bar"><div class="seokit-bar-fill seokit-bar-' + cls + '" style="width:' + pct + '%"></div></div>' +
    '<span class="seokit-bar-val">' + value + '/' + max + '</span>' +
  '</div>';
}

function buildMetaSection(meta) {
  var issueHTML = '';
  for (var i = 0; i < meta.issues.length; i++) {
    var issue = meta.issues[i];
    issueHTML += '<div class="seokit-issue seokit-issue-' + issue.severity + '">' +
      '<span class="seokit-issue-dot"></span>' + esc(issue.message) +
    '</div>';
  }
  return sectionWrap('Meta Tags', '' +
    '<div class="seokit-meta-item"><strong>Title:</strong> ' + esc(meta.title || '(missing)') + ' <span class="seokit-dim">(' + meta.titleLength + ' chars)</span></div>' +
    '<div class="seokit-meta-item"><strong>Description:</strong> ' + esc((meta.description || '(missing)').substring(0, 100)) + '... <span class="seokit-dim">(' + meta.descriptionLength + ' chars)</span></div>' +
    '<div class="seokit-meta-checks">' +
      check(meta.hasCanonical, 'Canonical URL') +
      check(meta.hasLang, 'Language') +
      check(meta.hasViewport, 'Viewport') +
      check(meta.hasOG, 'Open Graph') +
      check(meta.hasTwitterCard, 'Twitter Card') +
    '</div>' +
    (issueHTML ? '<div class="seokit-issues">' + issueHTML + '</div>' : '')
  );
}

function buildReadabilitySection(r) {
  return sectionWrap('Readability', '' +
    '<div class="seokit-stats-grid">' +
      stat('Flesch Score', r.flesReadingEase !== null ? r.flesReadingEase : 'N/A') +
      stat('Level', r.readingLevel) +
      stat('Words', r.wordCount) +
      stat('Sentences', r.sentenceCount) +
      stat('Avg Words/Sent', r.avgWordsPerSentence) +
      stat('Avg Word Length', r.avgWordLength) +
      stat('Long Words', r.longWordPercentage + '%') +
      stat('Reading Time', r.readingTime.minutes + 'm ' + r.readingTime.seconds + 's') +
    '</div>'
  );
}

function buildKeywordsSection(kw) {
  var kwHTML = '';
  var limit = Math.min(kw.topKeywords.length, 15);
  for (var i = 0; i < limit; i++) {
    var k = kw.topKeywords[i];
    kwHTML += '<span class="seokit-kw" title="' + k.count + ' occurrences (' + k.density + '%)">' + esc(k.term) + ' <sup>' + k.count + '</sup></span> ';
  }

  var bigramHTML = '';
  for (var j = 0; j < Math.min(kw.topBigrams.length, 8); j++) {
    var b = kw.topBigrams[j];
    bigramHTML += '<span class="seokit-kw seokit-kw-bi">' + esc(b.term) + ' <sup>' + b.count + '</sup></span> ';
  }

  return sectionWrap('Keywords', '' +
    '<div class="seokit-stats-grid">' +
      stat('Content Words', kw.totalContentWords) +
      stat('Unique Words', kw.uniqueWords) +
      stat('Lexical Diversity', kw.lexicalDiversity + '%') +
    '</div>' +
    '<div class="seokit-kw-cloud"><strong>Top Keywords:</strong><br>' + kwHTML + '</div>' +
    (bigramHTML ? '<div class="seokit-kw-cloud"><strong>Key Phrases:</strong><br>' + bigramHTML + '</div>' : '')
  );
}

function buildEntitiesSection(ent) {
  if (ent.total === 0) return sectionWrap('Entities', '<div class="seokit-dim">No named entities detected</div>');

  var typeHTML = '';
  var types = Object.keys(ent.typeSummary);
  for (var i = 0; i < types.length; i++) {
    typeHTML += '<span class="seokit-entity-type">' + types[i] + ': ' + ent.typeSummary[types[i]] + '</span> ';
  }

  var itemsHTML = '';
  var limit = Math.min(ent.items.length, 20);
  for (var j = 0; j < limit; j++) {
    itemsHTML += '<span class="seokit-entity" title="' + ent.items[j].type + '">' + esc(ent.items[j].value) + '</span> ';
  }

  return sectionWrap('Entities (' + ent.total + ')', '' +
    '<div class="seokit-entity-types">' + typeHTML + '</div>' +
    '<div class="seokit-entity-list">' + itemsHTML + '</div>'
  );
}

function buildSentimentSection(s) {
  var barPct = Math.round((s.overall + 1) * 50);
  return sectionWrap('Sentiment', '' +
    '<div class="seokit-sentiment-meter">' +
      '<div class="seokit-sentiment-bar"><div class="seokit-sentiment-fill" style="width:' + barPct + '%"></div><div class="seokit-sentiment-marker" style="left:' + barPct + '%"></div></div>' +
      '<div class="seokit-sentiment-labels"><span>Negative</span><span>Neutral</span><span>Positive</span></div>' +
    '</div>' +
    '<div class="seokit-sentiment-val">' + s.label + ' (' + s.overall + ')</div>'
  );
}

function buildStructureSection(st) {
  return sectionWrap('Page Structure', '' +
    '<div class="seokit-stats-grid">' +
      stat('H1 Tags', st.h1Count) +
      stat('Total Headings', st.totalHeadings) +
      stat('Paragraphs', st.paragraphCount) +
      stat('Internal Links', st.links.internal) +
      stat('External Links', st.links.external) +
      stat('Images', st.images.total) +
      stat('Alt Coverage', st.images.altCoverage + '%') +
      stat('Schema.org', st.hasStructuredData ? 'Yes' : 'No') +
    '</div>' +
    (st.h1Text.length > 0 ? '<div class="seokit-meta-item"><strong>H1:</strong> ' + esc(st.h1Text[0]) + '</div>' : '')
  );
}

function buildRecommendationsSection(recs) {
  if (recs.length === 0) return sectionWrap('Recommendations', '<div class="seokit-dim">No issues found!</div>');

  var html = '';
  for (var i = 0; i < recs.length; i++) {
    var r = recs[i];
    html += '<div class="seokit-rec seokit-rec-' + r.priority + '">' +
      '<span class="seokit-rec-badge">' + r.priority + '</span> ' +
      '<span class="seokit-rec-cat">[' + r.category + ']</span> ' +
      esc(r.message) +
    '</div>';
  }
  return sectionWrap('Recommendations (' + recs.length + ')', html);
}

// --- Utilities ---

function sectionWrap(title, content) {
  return '<div class="seokit-section">' +
    '<div class="seokit-section-title" data-seokit-toggle>' + title + ' <span class="seokit-toggle-arrow">&#9660;</span></div>' +
    '<div class="seokit-section-body">' + content + '</div>' +
  '</div>';
}

function stat(label, value) {
  return '<div class="seokit-stat"><div class="seokit-stat-val">' + value + '</div><div class="seokit-stat-label">' + label + '</div></div>';
}

function check(value, label) {
  return '<span class="seokit-check ' + (value ? 'seokit-check-pass' : 'seokit-check-fail') + '">' +
    (value ? '&#10003;' : '&#10007;') + ' ' + label + '</span>';
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bindEvents(container, results) {
  var fab = container.querySelector('#seokit-fab');
  var panel = container.querySelector('#seokit-panel');
  var closeBtn = container.querySelector('#seokit-close');

  fab.addEventListener('click', function () {
    panel.classList.toggle('seokit-collapsed');
  });
  closeBtn.addEventListener('click', function () {
    panel.classList.add('seokit-collapsed');
  });

  var toggles = container.querySelectorAll('[data-seokit-toggle]');
  for (var i = 0; i < toggles.length; i++) {
    toggles[i].addEventListener('click', function () {
      var body = this.nextElementSibling;
      var arrow = this.querySelector('.seokit-toggle-arrow');
      if (body.style.display === 'none') {
        body.style.display = 'block';
        arrow.innerHTML = '&#9660;';
      } else {
        body.style.display = 'none';
        arrow.innerHTML = '&#9654;';
      }
    });
  }

  // JSON export
  var footer = container.querySelector('.seokit-footer');
  footer.style.cursor = 'pointer';
  footer.title = 'Click to copy JSON report';
  footer.addEventListener('click', function () {
    var json = JSON.stringify(results, null, 2);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(json).then(function () {
        footer.textContent = 'Copied to clipboard!';
        setTimeout(function () { footer.textContent = 'Powered by SEOKit \u00b7 100% client-side'; }, 2000);
      });
    }
  });
}

function getCSS() {
  return '' +
    '#seokit-widget{all:initial;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;line-height:1.5;color:#1a1a2e;position:fixed;z-index:2147483647;}' +
    '#seokit-widget *{box-sizing:border-box;}' +
    '.seokit-panel{position:fixed;bottom:20px;right:20px;z-index:2147483647;}' +
    '.seokit-fab{width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 24px rgba(102,126,234,.4);transition:transform .2s,box-shadow .2s;}' +
    '.seokit-fab:hover{transform:scale(1.1);box-shadow:0 6px 32px rgba(102,126,234,.6);}' +
    '.seokit-fab-score{font-size:18px;font-weight:800;color:#fff;line-height:1;}' +
    '.seokit-fab-grade{font-size:10px;color:rgba(255,255,255,.85);text-transform:uppercase;letter-spacing:1px;font-weight:600;}' +
    '.seokit-body{display:block;position:fixed;bottom:92px;right:20px;width:380px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,.15);overflow:hidden;animation:seokit-slide .25s ease;}' +
    '.seokit-collapsed .seokit-body{display:none;}' +
    '@keyframes seokit-slide{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}' +
    '.seokit-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;}' +
    '.seokit-title{font-size:15px;font-weight:700;letter-spacing:.3px;}' +
    '.seokit-close{background:none;border:none;color:#fff;font-size:22px;cursor:pointer;padding:0 4px;opacity:.8;}' +
    '.seokit-close:hover{opacity:1;}' +
    '.seokit-content{overflow-y:auto;max-height:calc(100vh - 220px);padding:0;}' +
    '.seokit-section{border-bottom:1px solid #f0f0f5;padding:14px 20px;}' +
    '.seokit-section:last-child{border-bottom:none;}' +
    '.seokit-section-title{font-size:13px;font-weight:700;color:#667eea;cursor:pointer;user-select:none;display:flex;justify-content:space-between;align-items:center;}' +
    '.seokit-toggle-arrow{font-size:10px;color:#aaa;}' +
    '.seokit-section-body{margin-top:10px;}' +
    '.seokit-score-ring{text-align:center;margin-bottom:12px;}' +
    '.seokit-score-value{font-size:48px;font-weight:900;line-height:1;}' +
    '.seokit-score-value span{font-size:18px;color:#999;font-weight:400;}' +
    '.seokit-grade-a{color:#10b981;}.seokit-grade-b{color:#3b82f6;}.seokit-grade-c{color:#f59e0b;}.seokit-grade-d{color:#f97316;}.seokit-grade-f{color:#ef4444;}' +
    '.seokit-bar-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;}' +
    '.seokit-bar-label{width:110px;font-size:11px;color:#666;text-align:right;}' +
    '.seokit-bar{flex:1;height:8px;background:#f0f0f5;border-radius:4px;overflow:hidden;}' +
    '.seokit-bar-fill{height:100%;border-radius:4px;transition:width .6s ease;}' +
    '.seokit-bar-good{background:#10b981;}.seokit-bar-ok{background:#f59e0b;}.seokit-bar-poor{background:#ef4444;}' +
    '.seokit-bar-val{width:40px;font-size:11px;color:#888;text-align:right;}' +
    '.seokit-stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}' +
    '.seokit-stat{text-align:center;padding:8px 4px;background:#f8f9ff;border-radius:8px;}' +
    '.seokit-stat-val{font-size:16px;font-weight:700;color:#1a1a2e;}' +
    '.seokit-stat-label{font-size:10px;color:#888;margin-top:2px;}' +
    '.seokit-meta-item{font-size:12px;margin-bottom:6px;word-break:break-word;}' +
    '.seokit-meta-checks{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;}' +
    '.seokit-check{font-size:11px;padding:3px 8px;border-radius:12px;font-weight:600;}' +
    '.seokit-check-pass{background:#ecfdf5;color:#10b981;}.seokit-check-fail{background:#fef2f2;color:#ef4444;}' +
    '.seokit-issues{margin-top:10px;}' +
    '.seokit-issue{font-size:11px;padding:6px 10px;border-radius:6px;margin-bottom:4px;display:flex;align-items:center;gap:6px;}' +
    '.seokit-issue-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}' +
    '.seokit-issue-critical{background:#fef2f2;color:#991b1b;}.seokit-issue-critical .seokit-issue-dot{background:#ef4444;}' +
    '.seokit-issue-warning{background:#fffbeb;color:#92400e;}.seokit-issue-warning .seokit-issue-dot{background:#f59e0b;}' +
    '.seokit-issue-info{background:#eff6ff;color:#1e40af;}.seokit-issue-info .seokit-issue-dot{background:#3b82f6;}' +
    '.seokit-kw-cloud{margin-top:10px;}' +
    '.seokit-kw{display:inline-block;padding:3px 8px;margin:2px;background:#f0f0ff;border-radius:12px;font-size:12px;color:#4338ca;cursor:default;}' +
    '.seokit-kw sup{font-size:9px;color:#888;margin-left:1px;}' +
    '.seokit-kw-bi{background:#f0fdf4;color:#166534;}' +
    '.seokit-entity-types{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;}' +
    '.seokit-entity-type{font-size:11px;padding:2px 8px;background:#fef3c7;border-radius:10px;color:#92400e;font-weight:600;}' +
    '.seokit-entity-list{display:flex;flex-wrap:wrap;gap:4px;}' +
    '.seokit-entity{font-size:11px;padding:3px 8px;background:#ede9fe;border-radius:10px;color:#5b21b6;}' +
    '.seokit-sentiment-meter{margin-bottom:8px;}' +
    '.seokit-sentiment-bar{position:relative;height:12px;background:linear-gradient(90deg,#ef4444,#f59e0b,#10b981);border-radius:6px;overflow:visible;}' +
    '.seokit-sentiment-fill{display:none;}' +
    '.seokit-sentiment-marker{position:absolute;top:-3px;width:4px;height:18px;background:#1a1a2e;border-radius:2px;transform:translateX(-2px);}' +
    '.seokit-sentiment-labels{display:flex;justify-content:space-between;font-size:10px;color:#888;margin-top:4px;}' +
    '.seokit-sentiment-val{text-align:center;font-size:13px;font-weight:600;color:#1a1a2e;text-transform:capitalize;}' +
    '.seokit-rec{font-size:12px;padding:8px 12px;border-radius:8px;margin-bottom:4px;line-height:1.4;}' +
    '.seokit-rec-high{background:#fef2f2;color:#991b1b;}.seokit-rec-medium{background:#fffbeb;color:#92400e;}.seokit-rec-low{background:#f0f9ff;color:#1e40af;}' +
    '.seokit-rec-badge{display:inline-block;font-size:9px;text-transform:uppercase;font-weight:800;padding:1px 6px;border-radius:4px;letter-spacing:.5px;vertical-align:middle;}' +
    '.seokit-rec-high .seokit-rec-badge{background:#ef4444;color:#fff;}.seokit-rec-medium .seokit-rec-badge{background:#f59e0b;color:#fff;}.seokit-rec-low .seokit-rec-badge{background:#3b82f6;color:#fff;}' +
    '.seokit-rec-cat{font-size:10px;color:#888;font-weight:600;}' +
    '.seokit-footer{text-align:center;padding:10px;font-size:10px;color:#aaa;border-top:1px solid #f0f0f5;}' +
    '.seokit-dim{color:#aaa;font-size:12px;}' +
    '@media(max-width:440px){.seokit-body{width:calc(100vw - 24px);right:12px;bottom:84px;}.seokit-stats-grid{grid-template-columns:repeat(2,1fr);}}';
}

module.exports = { createWidget: createWidget, destroyWidget: destroyWidget };
