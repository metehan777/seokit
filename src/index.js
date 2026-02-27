'use strict';

var winkNLP = require('wink-nlp');
var model = require('wink-eng-lite-web-model');
var SEOAnalyzer = require('./analyzer');
var extractor = require('./extractor');
var ui = require('./ui');

var VERSION = '1.0.0';

function SEOKit(options) {
  this._options = Object.assign({
    autoRun: true,
    showWidget: true,
    onComplete: null,
    analyze: {
      readability: true,
      keywords: true,
      entities: true,
      sentiment: true,
      structure: true,
      meta: true
    }
  }, options || {});

  this._nlp = winkNLP(model);
  this._analyzer = new SEOAnalyzer(this._nlp);
  this._results = null;
  this._ready = false;

  if (this._options.autoRun) {
    this._scheduleAnalysis();
  }
}

SEOKit.prototype._scheduleAnalysis = function _scheduleAnalysis() {
  var self = this;

  if (document.readyState === 'complete') {
    self._runWhenIdle();
    return;
  }

  window.addEventListener('load', function () {
    self._runWhenIdle();
  });
};

SEOKit.prototype._runWhenIdle = function _runWhenIdle() {
  var self = this;

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(function () { self.run(); }, { timeout: 5000 });
  } else {
    setTimeout(function () { self.run(); }, 100);
  }
};

SEOKit.prototype.run = function run() {
  var startTime = performance.now();
  var pageContent = extractor.extractPageContent();
  var results = this._analyzer.analyze(pageContent);
  results._performance = {
    analysisTime: Math.round(performance.now() - startTime),
    version: VERSION
  };

  this._results = results;
  this._ready = true;

  if (this._options.showWidget) {
    ui.createWidget(results);
  }

  if (typeof this._options.onComplete === 'function') {
    this._options.onComplete(results);
  }

  return results;
};

SEOKit.prototype.getResults = function getResults() {
  return this._results;
};

SEOKit.prototype.toJSON = function toJSON() {
  return JSON.stringify(this._results, null, 2);
};

SEOKit.prototype.isReady = function isReady() {
  return this._ready;
};

SEOKit.prototype.analyzeText = function analyzeText(text) {
  var doc = this._nlp.readDoc(text);
  var its = this._nlp.its;

  var readabilityStats = null;
  try { readabilityStats = doc.out(its.readabilityStats); } catch (e) { /* model may not support */ }

  var tokens = doc.tokens();
  var words = [];
  var stopWords = [];
  tokens.each(function (t) {
    if (t.out(its.type) === 'word') {
      if (t.out(its.stopWordFlag)) {
        stopWords.push(t.out(its.normal));
      } else {
        words.push(t.out(its.normal));
      }
    }
  });

  var entities = [];
  doc.entities().each(function (e) {
    entities.push(e.out(its.detail));
  });

  var sentiment = doc.out(its.sentiment);

  var freq = {};
  for (var i = 0; i < words.length; i++) {
    freq[words[i]] = (freq[words[i]] || 0) + 1;
  }

  var topWords = Object.keys(freq)
    .sort(function (a, b) { return freq[b] - freq[a]; })
    .slice(0, 20)
    .map(function (w) { return { term: w, count: freq[w] }; });

  return {
    readability: readabilityStats,
    wordCount: words.length + stopWords.length,
    contentWords: words.length,
    stopWords: stopWords.length,
    sentences: doc.sentences().length(),
    entities: entities,
    sentiment: sentiment,
    topKeywords: topWords,
    tokens: tokens.length()
  };
};

SEOKit.prototype.showWidget = function showWidget() {
  if (this._results) ui.createWidget(this._results);
};

SEOKit.prototype.hideWidget = function hideWidget() {
  ui.destroyWidget();
};

SEOKit.prototype.destroy = function destroy() {
  ui.destroyWidget();
  this._results = null;
  this._ready = false;
};

// NLP proxy for direct access
SEOKit.prototype.nlp = function nlp() {
  return this._nlp;
};

// --- Global registration ---
var globalInit = null;

if (typeof window !== 'undefined') {
  window.SEOKit = SEOKit;

  // Auto-init from script data attributes
  var scripts = document.querySelectorAll('script[data-seokit]');
  if (scripts.length > 0) {
    var scriptEl = scripts[scripts.length - 1];
    var autoOpts = {};

    if (scriptEl.getAttribute('data-seokit-widget') === 'false') {
      autoOpts.showWidget = false;
    }
    if (scriptEl.getAttribute('data-seokit-auto') === 'false') {
      autoOpts.autoRun = false;
    }

    globalInit = new SEOKit(autoOpts);
    window.seokit = globalInit;
  }
}

module.exports = SEOKit;
