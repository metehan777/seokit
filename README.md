# SEOKit

**Drop-in SEO & AI content intelligence for any website. One `<script>` tag. 100% client-side. Zero data leaves the browser.**

Built on [wink-nlp](https://github.com/winkjs/wink-nlp) — a fast, lightweight natural language processing library that runs entirely in the browser.

## What It Does

Paste a single script tag into any page and get instant analysis:

- **Readability** — Flesch Reading Ease, grade level, reading time, sentence complexity
- **Keyword Analysis** — top keywords, bigrams/trigrams, lexical diversity, keyword density
- **Entity Recognition** — people, organizations, locations, dates, quantities (via wink-nlp NER)
- **Sentiment Analysis** — overall tone with per-sentence breakdown
- **AI Chunk Analysis** — scores each content section for AI search snippet potential (Google AI Overviews, Perplexity, RAG systems)
- **Meta & Structure Audit** — title, description, Open Graph, Twitter Cards, canonical, headings, alt text coverage, Schema.org
- **Content Score** — 0-100 composite grade with actionable recommendations

## Quick Start

```html
<script src="https://your-cdn.com/seokit-loader.min.js" data-seokit async></script>
```

That's it. A floating widget appears in the bottom-right corner with the full analysis.

## How It Works

SEOKit uses a two-phase architecture optimized for zero page-speed impact:

1. **Loader** (~23KB) runs on the main thread — extracts DOM content (meta tags, headings, sections, links, images)
2. **Worker** (~3.7MB, loaded async after `onload`) runs wink-nlp in a Web Worker — all heavy NLP computation happens off the main thread

The NLP model (`wink-eng-lite-web-model`) is cached via the Cache API so subsequent visits don't re-download it.

## Architecture

```
seokit-loader.min.js  (23KB, main thread)
  ├── DOM extraction (meta, headings, sections, links, images, structured data)
  ├── Widget rendering
  └── Spawns Web Worker ↓

seokit-worker.min.js  (3.7MB, Web Worker, loaded async)
  ├── wink-nlp + wink-eng-lite-web-model
  ├── Readability, keywords, entities, sentiment analysis
  └── AI chunk analysis (snippet scoring, topic alignment, key statements)
```

## JavaScript API

```js
const kit = new SEOKit({ showWidget: true });

// Wait for analysis to complete
kit.onReady(function(results) {
  console.log(results.score);       // { total: 72, grade: 'B', breakdown: {...} }
  console.log(results.chunks);      // { items: [...], summary: {...} }
  console.log(results.readability); // { flesReadingEase: 45, readingLevel: '...', ... }
  console.log(results.keywords);    // { topKeywords: [...], topBigrams: [...], ... }
  console.log(results.entities);    // { items: [...], typeSummary: {...} }
});

// Analyze arbitrary text
kit.analyzeText("Your text here").then(function(result) {
  console.log(result);
});
```

## AI Chunk Analysis

The chunk analyzer scores each heading-delimited section of your page for **AI search snippet potential** — how likely each section is to be selected by RAG pipelines, Google AI Overviews, or Perplexity as a source chunk.

Each chunk is scored (0-100) based on:

| Factor | What It Measures |
|---|---|
| **Word count** | Sweet spot of 40-300 words per chunk (ideal for RAG retrieval) |
| **Entity density** | Named entities per 100 words (information richness) |
| **Vocabulary diversity** | Unique term ratio (avoids repetitive filler) |
| **Topic alignment** | How well the chunk's keywords match the page's overall topic |
| **Heading presence** | AI chunkers use headings as natural boundaries |
| **Key statements** | Most important sentences identified via wink-nlp |

Grades: **A** (80+), **B** (65+), **C** (50+), **D** (35+), **F** (<35)

## Configuration

```html
<!-- All options via data attributes -->
<script src="seokit-loader.min.js"
  data-seokit
  data-seokit-widget="false"
  data-seokit-worker="false"
  data-seokit-auto="false"
  async></script>
```

| Attribute | Default | Description |
|---|---|---|
| `data-seokit` | required | Enables auto-initialization |
| `data-seokit-widget` | `true` | Show/hide the floating widget |
| `data-seokit-worker` | `true` | Use Web Worker (falls back to main thread if `false`) |
| `data-seokit-auto` | `true` | Auto-run analysis on page load |
| `data-seokit-base` | auto | Base URL for worker/engine files |

## Development

```bash
npm install
npm run build        # Production build (minified)
npm run build:dev    # Development build
npm run demo         # Build + launch demo at localhost:3333
```

## Project Structure

```
src/
  loader.js     – Main thread entry point (DOM extraction, widget, worker spawning)
  analyzer.js   – NLP analysis engine (readability, keywords, entities, chunks)
  worker.js     – Web Worker entry point
  engine.js     – Main-thread fallback (no-worker mode)
  index.js      – Monolith bundle (all-in-one, legacy)
  extractor.js  – DOM content extractor
  ui.js         – Widget UI components
demo/
  index.html    – Live demo page
webpack.config.js – Multi-entry build config
```

## Credits

- **[wink-nlp](https://github.com/winkjs/wink-nlp)** by [winkJS](https://winkjs.org/) — the NLP engine powering all text analysis. Fast, lightweight, runs in the browser. MIT licensed.
- **[wink-eng-lite-web-model](https://github.com/winkjs/wink-eng-lite-web-model)** — English language model optimized for browser use.

## License

MIT
