'use strict';

var winkNLP = require('wink-nlp');
var model = require('wink-eng-lite-web-model');
var SEOAnalyzer = require('./analyzer');

var nlp = winkNLP(model);
var analyzer = new SEOAnalyzer(nlp);
var its = nlp.its;

self.addEventListener('message', function (e) {
  var msg = e.data;

  if (msg.type === 'analyze') {
    var results = analyzer.analyze(msg.pageContent);
    self.postMessage({ type: 'analysisResult', result: results });
  }

  if (msg.type === 'analyzeText') {
    var doc = nlp.readDoc(msg.text);

    var readabilityStats = null;
    try { readabilityStats = doc.out(its.readabilityStats); } catch (err) {}

    var words = [];
    var stopWords = [];
    doc.tokens().each(function (t) {
      if (t.out(its.type) === 'word') {
        if (t.out(its.stopWordFlag)) stopWords.push(t.out(its.normal));
        else words.push(t.out(its.normal));
      }
    });

    var entities = [];
    doc.entities().each(function (ent) { entities.push(ent.out(its.detail)); });

    var freq = {};
    for (var i = 0; i < words.length; i++) freq[words[i]] = (freq[words[i]] || 0) + 1;

    var topWords = Object.keys(freq)
      .sort(function (a, b) { return freq[b] - freq[a]; })
      .slice(0, 20)
      .map(function (w) { return { term: w, count: freq[w] }; });

    self.postMessage({
      type: 'textResult',
      id: msg.id,
      result: {
        readability: readabilityStats,
        wordCount: words.length + stopWords.length,
        contentWords: words.length,
        stopWords: stopWords.length,
        sentences: doc.sentences().length(),
        entities: entities,
        sentiment: doc.out(its.sentiment),
        topKeywords: topWords,
        tokens: doc.tokens().length()
      }
    });
  }
});
