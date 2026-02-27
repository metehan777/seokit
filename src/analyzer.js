'use strict';

function SEOAnalyzer(nlp) {
  this._nlp = nlp;
  this._its = nlp.its;
  this._as = nlp.as;
}

SEOAnalyzer.prototype.analyze = function analyze(pageContent) {
  var text = pageContent.bodyText;
  if (!text || text.length < 10) {
    return { error: 'Insufficient content for analysis', content: pageContent };
  }

  var doc = this._nlp.readDoc(text);
  var its = this._its;
  var as = this._as;

  var readability = this._readability(doc, its);
  var keywords = this._keywords(doc, its, as);
  var entities = this._entities(doc, its);
  var sentiment = this._sentiment(doc, its);
  var structure = this._structure(pageContent);
  var metaAnalysis = this._metaAnalysis(pageContent);
  var chunks = this._chunks(pageContent, its, keywords);
  var contentScore = this._contentScore(readability, keywords, entities, sentiment, structure, metaAnalysis, pageContent);
  var recommendations = this._recommendations(contentScore, readability, keywords, structure, metaAnalysis, pageContent);

  return {
    url: pageContent.url,
    timestamp: pageContent.timestamp,
    score: contentScore,
    readability: readability,
    keywords: keywords,
    entities: entities,
    sentiment: sentiment,
    structure: structure,
    meta: metaAnalysis,
    chunks: chunks,
    recommendations: recommendations,
    raw: pageContent
  };
};

SEOAnalyzer.prototype._readability = function _readability(doc, its) {
  var stats;
  try {
    stats = doc.out(its.readabilityStats);
  } catch (e) {
    stats = null;
  }

  var sentences = doc.sentences();
  var sentenceCount = sentences.length();
  var tokens = doc.tokens();
  var tokenCount = tokens.length();

  var wordTokens = [];
  tokens.each(function (t) {
    var type = t.out(its.type);
    if (type === 'word') wordTokens.push(t.out());
  });
  var wordCount = wordTokens.length;
  var avgWordsPerSentence = sentenceCount > 0 ? Math.round((wordCount / sentenceCount) * 10) / 10 : 0;

  var totalChars = 0;
  for (var i = 0; i < wordTokens.length; i++) {
    totalChars += wordTokens[i].length;
  }
  var avgWordLength = wordCount > 0 ? Math.round((totalChars / wordCount) * 10) / 10 : 0;

  var longWords = 0;
  for (var j = 0; j < wordTokens.length; j++) {
    if (wordTokens[j].length > 6) longWords++;
  }

  var fres = stats && stats.fres !== undefined ? stats.fres : null;
  var readingLevel = fresLabel(fres);

  var readingTime;
  if (stats && stats.readingTimeMins !== undefined) {
    readingTime = { minutes: stats.readingTimeMins, seconds: stats.readingTimeSecs || 0 };
  } else {
    readingTime = estimateReadingTime(wordCount);
  }

  return {
    flesReadingEase: fres,
    readingLevel: readingLevel,
    sentenceCount: sentenceCount,
    wordCount: wordCount,
    tokenCount: tokenCount,
    avgWordsPerSentence: avgWordsPerSentence,
    avgWordLength: avgWordLength,
    longWordPercentage: wordCount > 0 ? Math.round((longWords / wordCount) * 1000) / 10 : 0,
    readingTime: readingTime,
    complexWords: stats && stats.numOfComplexWords ? { count: stats.numOfComplexWords, words: stats.complexWords } : null
  };
};

SEOAnalyzer.prototype._keywords = function _keywords(doc, its, as) {
  var tokens = doc.tokens();
  var words = [];

  tokens.each(function (t) {
    var type = t.out(its.type);
    var isStop = t.out(its.stopWordFlag);
    if (type === 'word' && !isStop) {
      words.push(t.out(its.normal));
    }
  });

  var freq = {};
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    freq[w] = (freq[w] || 0) + 1;
  }

  var totalWords = words.length;
  var sorted = Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; });

  var top = [];
  var limit = Math.min(sorted.length, 30);
  for (var j = 0; j < limit; j++) {
    var word = sorted[j];
    top.push({
      term: word,
      count: freq[word],
      density: Math.round((freq[word] / totalWords) * 10000) / 100
    });
  }

  var bigrams = extractNgrams(words, 2);
  var trigrams = extractNgrams(words, 3);

  return {
    totalContentWords: totalWords,
    uniqueWords: sorted.length,
    lexicalDiversity: totalWords > 0 ? Math.round((sorted.length / totalWords) * 1000) / 10 : 0,
    topKeywords: top,
    topBigrams: bigrams.slice(0, 15),
    topTrigrams: trigrams.slice(0, 10)
  };
};

SEOAnalyzer.prototype._entities = function _entities(doc, its) {
  var entities = doc.entities();
  var result = [];
  var typeCounts = {};

  entities.each(function (e) {
    var detail = e.out(its.detail);
    result.push(detail);
    var type = detail.type || 'UNKNOWN';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });

  return {
    total: result.length,
    items: result.slice(0, 50),
    typeSummary: typeCounts
  };
};

SEOAnalyzer.prototype._sentiment = function _sentiment(doc, its) {
  var overall = doc.out(its.sentiment);
  var sentences = doc.sentences();
  var sentenceSentiments = [];

  sentences.each(function (s) {
    sentenceSentiments.push({
      text: s.out().substring(0, 120),
      score: s.out(its.sentiment)
    });
  });

  sentenceSentiments.sort(function (a, b) { return a.score - b.score; });
  var mostNegative = sentenceSentiments.slice(0, 3);
  var mostPositive = sentenceSentiments.slice(-3).reverse();

  var label = 'neutral';
  if (overall > 0.2) label = 'positive';
  else if (overall > 0.05) label = 'slightly positive';
  else if (overall < -0.2) label = 'negative';
  else if (overall < -0.05) label = 'slightly negative';

  return {
    overall: Math.round(overall * 1000) / 1000,
    label: label,
    mostPositive: mostPositive,
    mostNegative: mostNegative
  };
};

SEOAnalyzer.prototype._structure = function _structure(pageContent) {
  var h = pageContent.headings;
  var h1Count = h.h1.length;
  var totalHeadings = h.h1.length + h.h2.length + h.h3.length + h.h4.length + h.h5.length + h.h6.length;

  var hierarchy = [];
  for (var level = 1; level <= 6; level++) {
    var tag = 'h' + level;
    for (var i = 0; i < h[tag].length; i++) {
      hierarchy.push({ level: level, text: h[tag][i] });
    }
  }

  var hasSkippedLevel = false;
  var prevLevel = 0;
  for (var k = 0; k < hierarchy.length; k++) {
    if (hierarchy[k].level - prevLevel > 1 && prevLevel > 0) {
      hasSkippedLevel = true;
    }
    prevLevel = hierarchy[k].level;
  }

  return {
    h1Count: h1Count,
    h1Text: h.h1,
    totalHeadings: totalHeadings,
    headingBreakdown: {
      h1: h.h1.length, h2: h.h2.length, h3: h.h3.length,
      h4: h.h4.length, h5: h.h5.length, h6: h.h6.length
    },
    hasProperHierarchy: !hasSkippedLevel && h1Count === 1,
    paragraphCount: pageContent.paragraphs.length,
    links: pageContent.links,
    images: pageContent.images,
    hasStructuredData: pageContent.structuredData.length > 0,
    structuredDataCount: pageContent.structuredData.length
  };
};

SEOAnalyzer.prototype._metaAnalysis = function _metaAnalysis(pageContent) {
  var m = pageContent.meta;
  var issues = [];

  if (!m.title) issues.push({ severity: 'critical', message: 'Missing page title' });
  else if (m.titleLength < 30) issues.push({ severity: 'warning', message: 'Title too short (' + m.titleLength + ' chars, aim for 50-60)' });
  else if (m.titleLength > 60) issues.push({ severity: 'warning', message: 'Title too long (' + m.titleLength + ' chars, aim for 50-60)' });

  if (!m.description) issues.push({ severity: 'critical', message: 'Missing meta description' });
  else if (m.descriptionLength < 120) issues.push({ severity: 'warning', message: 'Meta description too short (' + m.descriptionLength + ' chars, aim for 150-160)' });
  else if (m.descriptionLength > 160) issues.push({ severity: 'warning', message: 'Meta description too long (' + m.descriptionLength + ' chars, aim for 150-160)' });

  if (!m.canonical) issues.push({ severity: 'info', message: 'No canonical URL specified' });
  if (!m.lang) issues.push({ severity: 'warning', message: 'Missing lang attribute on html element' });
  if (!m.viewport) issues.push({ severity: 'warning', message: 'Missing viewport meta tag' });
  if (!m.og['og:title']) issues.push({ severity: 'info', message: 'Missing Open Graph title' });
  if (!m.og['og:description']) issues.push({ severity: 'info', message: 'Missing Open Graph description' });
  if (!m.og['og:image']) issues.push({ severity: 'info', message: 'Missing Open Graph image' });
  if (!m.twitter['twitter:card']) issues.push({ severity: 'info', message: 'Missing Twitter Card meta tags' });

  var criticals = 0, warnings = 0, infos = 0;
  for (var i = 0; i < issues.length; i++) {
    if (issues[i].severity === 'critical') criticals++;
    else if (issues[i].severity === 'warning') warnings++;
    else infos++;
  }

  return {
    title: m.title,
    titleLength: m.titleLength,
    description: m.description,
    descriptionLength: m.descriptionLength,
    hasCanonical: !!m.canonical,
    hasLang: !!m.lang,
    hasViewport: !!m.viewport,
    hasOG: !!m.og['og:title'],
    hasTwitterCard: !!m.twitter['twitter:card'],
    issues: issues,
    summary: { critical: criticals, warning: warnings, info: infos }
  };
};

SEOAnalyzer.prototype._contentScore = function _contentScore(readability, keywords, entities, sentiment, structure, meta, pageContent) {
  var score = 100;
  var breakdown = {};

  // Readability (0-25 points)
  var readScore = 25;
  if (readability.flesReadingEase !== null) {
    if (readability.flesReadingEase < 30) readScore -= 15;
    else if (readability.flesReadingEase < 50) readScore -= 8;
    else if (readability.flesReadingEase > 80) readScore -= 3;
  }
  if (readability.avgWordsPerSentence > 25) readScore -= 5;
  if (readability.avgWordsPerSentence < 5) readScore -= 3;
  readScore = Math.max(0, readScore);
  breakdown.readability = readScore;

  // Keywords & Content Depth (0-25 points)
  var kwScore = 25;
  if (keywords.totalContentWords < 100) kwScore -= 15;
  else if (keywords.totalContentWords < 300) kwScore -= 8;
  if (keywords.lexicalDiversity < 20) kwScore -= 5;
  if (keywords.topBigrams.length < 3) kwScore -= 3;
  kwScore = Math.max(0, kwScore);
  breakdown.content = kwScore;

  // Structure (0-25 points)
  var structScore = 25;
  if (structure.h1Count === 0) structScore -= 10;
  if (structure.h1Count > 1) structScore -= 5;
  if (!structure.hasProperHierarchy) structScore -= 5;
  if (structure.images.withoutAlt > 0) structScore -= Math.min(5, structure.images.withoutAlt);
  if (structure.links.total === 0) structScore -= 3;
  structScore = Math.max(0, structScore);
  breakdown.structure = structScore;

  // Meta & Technical (0-25 points)
  var metaScore = 25;
  metaScore -= meta.summary.critical * 8;
  metaScore -= meta.summary.warning * 3;
  metaScore -= meta.summary.info * 1;
  if (structure.hasStructuredData) metaScore = Math.min(25, metaScore + 3);
  metaScore = Math.max(0, metaScore);
  breakdown.meta = metaScore;

  score = breakdown.readability + breakdown.content + breakdown.structure + breakdown.meta;

  var grade;
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 65) grade = 'C';
  else if (score >= 50) grade = 'D';
  else grade = 'F';

  return {
    total: score,
    grade: grade,
    breakdown: breakdown
  };
};

SEOAnalyzer.prototype._recommendations = function _recommendations(score, readability, keywords, structure, meta, pageContent) {
  var recs = [];

  if (meta.summary.critical > 0) {
    for (var i = 0; i < meta.issues.length; i++) {
      if (meta.issues[i].severity === 'critical') {
        recs.push({ priority: 'high', category: 'meta', message: meta.issues[i].message });
      }
    }
  }

  if (structure.h1Count === 0) {
    recs.push({ priority: 'high', category: 'structure', message: 'Add an H1 heading that includes your primary keyword' });
  } else if (structure.h1Count > 1) {
    recs.push({ priority: 'medium', category: 'structure', message: 'Use only one H1 heading per page (found ' + structure.h1Count + ')' });
  }

  if (!structure.hasProperHierarchy) {
    recs.push({ priority: 'medium', category: 'structure', message: 'Fix heading hierarchy — avoid skipping levels (e.g., H1 → H3 without H2)' });
  }

  if (keywords.totalContentWords < 300) {
    recs.push({ priority: 'high', category: 'content', message: 'Content is thin (' + keywords.totalContentWords + ' words). Aim for 600+ words for better ranking' });
  }

  if (readability.flesReadingEase !== null && readability.flesReadingEase < 40) {
    recs.push({ priority: 'medium', category: 'readability', message: 'Content is hard to read (Flesch score: ' + readability.flesReadingEase + '). Simplify sentences and use shorter words' });
  }

  if (readability.avgWordsPerSentence > 25) {
    recs.push({ priority: 'medium', category: 'readability', message: 'Average sentence length is ' + readability.avgWordsPerSentence + ' words. Keep sentences under 20 words for better readability' });
  }

  if (structure.images.withoutAlt > 0) {
    recs.push({ priority: 'medium', category: 'accessibility', message: structure.images.withoutAlt + ' image(s) missing alt text' });
  }

  if (keywords.lexicalDiversity < 25) {
    recs.push({ priority: 'low', category: 'content', message: 'Low vocabulary diversity (' + keywords.lexicalDiversity + '%). Use more varied language' });
  }

  if (!structure.hasStructuredData) {
    recs.push({ priority: 'low', category: 'technical', message: 'No structured data (JSON-LD) found. Add schema markup for rich search results' });
  }

  for (var j = 0; j < meta.issues.length; j++) {
    if (meta.issues[j].severity === 'warning') {
      recs.push({ priority: 'medium', category: 'meta', message: meta.issues[j].message });
    }
  }

  recs.sort(function (a, b) {
    var order = { high: 0, medium: 1, low: 2 };
    return (order[a.priority] || 3) - (order[b.priority] || 3);
  });

  return recs;
};

SEOAnalyzer.prototype._chunks = function _chunks(pageContent, its, globalKeywords) {
  var nlp = this._nlp;
  var sections = pageContent.sections || [];
  if (sections.length === 0) return { items: [], summary: null };

  var globalTopTerms = {};
  var topKw = globalKeywords.topKeywords || [];
  for (var g = 0; g < Math.min(topKw.length, 10); g++) {
    globalTopTerms[topKw[g].term] = true;
  }

  var analyzed = [];
  var totalScore = 0;

  for (var i = 0; i < sections.length; i++) {
    var sec = sections[i];
    if (!sec.text || sec.text.length < 20) continue;

    var doc = nlp.readDoc(sec.text);
    var sentences = doc.sentences();
    var sentenceCount = sentences.length();

    // Per-chunk entities
    var entities = [];
    doc.entities().each(function (e) { entities.push(e.out(its.detail)); });

    // Per-chunk keywords (non-stop words)
    var words = [];
    doc.tokens().each(function (t) {
      if (t.out(its.type) === 'word' && !t.out(its.stopWordFlag)) {
        words.push(t.out(its.normal));
      }
    });

    var freq = {};
    for (var w = 0; w < words.length; w++) {
      freq[words[w]] = (freq[words[w]] || 0) + 1;
    }
    var sortedTerms = Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; });
    var topTerms = sortedTerms.slice(0, 5).map(function (t) { return { term: t, count: freq[t] }; });

    // Sentiment
    var sentiment = doc.out(its.sentiment);

    // Sentence importance
    var importance = [];
    try {
      importance = doc.out(its.sentenceWiseImportance) || [];
    } catch (e) {}

    var topImportance = importance.slice().sort(function (a, b) {
      return (b.importance || 0) - (a.importance || 0);
    }).slice(0, 3);

    // Information density: entities per 100 words
    var entityDensity = words.length > 0 ? Math.round((entities.length / words.length) * 10000) / 100 : 0;

    // Unique term ratio
    var uniqueRatio = words.length > 0 ? Math.round((sortedTerms.length / words.length) * 1000) / 10 : 0;

    // Topic alignment: how many of this chunk's top terms appear in global top keywords
    var alignedCount = 0;
    for (var a = 0; a < Math.min(sortedTerms.length, 10); a++) {
      if (globalTopTerms[sortedTerms[a]]) alignedCount++;
    }
    var topicAlignment = Math.min(sortedTerms.length, 10) > 0 ? Math.round((alignedCount / Math.min(sortedTerms.length, 10)) * 100) : 0;

    // AI snippet potential scoring (0-100)
    var snippetScore = computeSnippetScore(words.length, sentenceCount, entities.length, entityDensity, uniqueRatio, sec.heading);

    totalScore += snippetScore;

    analyzed.push({
      index: i,
      heading: sec.heading || '(No heading)',
      level: sec.level,
      wordCount: words.length,
      sentenceCount: sentenceCount,
      topTerms: topTerms,
      entities: entities.slice(0, 10),
      entityCount: entities.length,
      entityDensity: entityDensity,
      uniqueTermRatio: uniqueRatio,
      sentiment: Math.round(sentiment * 1000) / 1000,
      topicAlignment: topicAlignment,
      snippetScore: snippetScore,
      snippetGrade: snippetGrade(snippetScore),
      keyStatements: topImportance.map(function (imp) {
        try {
          return sentences.itemAt(imp.index).out().substring(0, 150);
        } catch (e) { return ''; }
      }).filter(Boolean)
    });
  }

  // Summary across all chunks
  var avgScore = analyzed.length > 0 ? Math.round(totalScore / analyzed.length) : 0;
  var weakChunks = analyzed.filter(function (c) { return c.snippetScore < 40; });
  var strongChunks = analyzed.filter(function (c) { return c.snippetScore >= 70; });

  return {
    items: analyzed,
    summary: {
      totalChunks: analyzed.length,
      avgSnippetScore: avgScore,
      avgGrade: snippetGrade(avgScore),
      strongChunks: strongChunks.length,
      weakChunks: weakChunks.length,
      weakChunkHeadings: weakChunks.map(function (c) { return c.heading; })
    }
  };
};

function computeSnippetScore(wordCount, sentenceCount, entityCount, entityDensity, uniqueRatio, heading) {
  var score = 50;

  // Word count sweet spot: 40-300 words is ideal for RAG chunks
  if (wordCount >= 40 && wordCount <= 300) score += 15;
  else if (wordCount >= 20 && wordCount <= 500) score += 8;
  else if (wordCount < 20) score -= 20;
  else score -= 5; // too long — will be split by chunkers

  // Entity richness
  if (entityCount >= 3) score += 10;
  else if (entityCount >= 1) score += 5;
  else score -= 5;

  // Information density (entities per 100 words)
  if (entityDensity >= 3 && entityDensity <= 15) score += 10;
  else if (entityDensity > 0) score += 3;

  // Vocabulary diversity
  if (uniqueRatio >= 50 && uniqueRatio <= 85) score += 8;
  else if (uniqueRatio >= 30) score += 3;
  else score -= 5;

  // Has a heading (AI chunkers use headings as boundaries)
  if (heading && heading !== '(Introduction)' && heading !== '(No heading)') score += 7;

  return Math.max(0, Math.min(100, score));
}

function snippetGrade(score) {
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

// --- Helpers ---

function fresLabel(score) {
  if (score === null || score === undefined) return 'unknown';
  if (score >= 90) return 'Very Easy (5th grade)';
  if (score >= 80) return 'Easy (6th grade)';
  if (score >= 70) return 'Fairly Easy (7th grade)';
  if (score >= 60) return 'Standard (8th-9th grade)';
  if (score >= 50) return 'Fairly Difficult (10th-12th grade)';
  if (score >= 30) return 'Difficult (College level)';
  return 'Very Difficult (Graduate level)';
}

function estimateReadingTime(wordCount) {
  var minutes = Math.floor(wordCount / 200);
  var seconds = Math.round(((wordCount % 200) / 200) * 60);
  return { minutes: minutes, seconds: seconds };
}

function extractNgrams(words, n) {
  var ngrams = {};
  for (var i = 0; i <= words.length - n; i++) {
    var gram = words.slice(i, i + n).join(' ');
    ngrams[gram] = (ngrams[gram] || 0) + 1;
  }
  var sorted = Object.keys(ngrams)
    .filter(function (k) { return ngrams[k] >= 2; })
    .sort(function (a, b) { return ngrams[b] - ngrams[a]; });

  var result = [];
  for (var j = 0; j < sorted.length; j++) {
    result.push({ term: sorted[j], count: ngrams[sorted[j]] });
  }
  return result;
}

module.exports = SEOAnalyzer;
