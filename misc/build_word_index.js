// Generates data/arabic_words_index.json — a deduplicated flat array of unique
// Arabic word forms across all 114 surahs, keyed by stripped-diacritic form.
// Run once from the repo root: node misc/build_word_index.js

const fs   = require("fs");
const path = require("path");

const dataDir    = path.join(__dirname, "../data/arabic_words");
const outputFile = path.join(__dirname, "../data/arabic_words_index.json");

function stripDiacritics(s) {
  return s.replace(
    /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g,
    ""
  );
}

const seen = new Map();

const files = fs.readdirSync(dataDir)
  .filter(f => f.endsWith(".json"))
  .sort((a, b) => parseInt(a) - parseInt(b));

for (const file of files) {
  const surahId = parseInt(file);
  const data    = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
  for (const [ayahNum, words] of Object.entries(data)) {
    for (const word of words) {
      const key = stripDiacritics(word.arabic);
      if (!seen.has(key)) {
        seen.set(key, {
          ar: word.arabic,
          tr: word.translation,
          s:  surahId,
          n:  parseInt(ayahNum)
        });
      }
    }
  }
}

const index = Array.from(seen.values());
fs.writeFileSync(outputFile, JSON.stringify(index));
const kb = (Buffer.byteLength(JSON.stringify(index)) / 1024).toFixed(1);
console.log(`Written ${index.length} unique word forms → ${outputFile} (${kb} KB)`);
