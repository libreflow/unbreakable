import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";

let _initialized = false;

function ensureInit(): void {
  if (_initialized) return;
  zxcvbnOptions.setOptions({
    translations: zxcvbnEnPackage.translations,
    graphs: zxcvbnCommonPackage.adjacencyGraphs,
    dictionary: {
      ...zxcvbnCommonPackage.dictionary,
      ...zxcvbnEnPackage.dictionary,
    },
  });
  _initialized = true;
}

export interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  bits: number;
  label: string;
  cssClass: string;
}

const LABELS = ["Inacceptable", "Faible", "Moyen", "Fort", "Très fort"];
const CSS = ["score-0", "score-1", "score-2", "score-3", "score-4"];

// P1: zxcvbn is the heaviest computation in the app and multiple components
// (panels, StrengthMeter, copy pipeline) analyze the same secret. A bounded
// LRU cache dedupes those runs instead of recomputing per call site.
const CACHE_MAX = 32;
const cache = new Map<string, StrengthResult>();

export function analyzeStrength(secret: string): StrengthResult {
  if (!secret) return { score: 0, bits: 0, label: LABELS[0], cssClass: CSS[0] };
  const hit = cache.get(secret);
  if (hit) {
    cache.delete(secret);
    cache.set(secret, hit);
    return hit;
  }
  ensureInit();
  const res = zxcvbn(secret);
  const score = res.score as 0 | 1 | 2 | 3 | 4;
  const bits = res.guessesLog10 * Math.log2(10);
  const result: StrengthResult = { score, bits, label: LABELS[score], cssClass: CSS[score] };
  if (cache.size >= CACHE_MAX) {
    cache.delete(cache.keys().next().value as string);
  }
  cache.set(secret, result);
  return result;
}
