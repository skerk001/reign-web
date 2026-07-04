/**
 * Fuzzy search for player names.
 * Handles: accent-less input (jokic → Jokić), typos (lebrone → LeBron),
 * partial matches, and last-name-first searches.
 */

const ACCENT_MAP = {
  'ć': 'c', 'č': 'c', 'ž': 'z', 'š': 's', 'đ': 'd', 'ñ': 'n',
  'á': 'a', 'à': 'a', 'ä': 'a', 'â': 'a', 'ã': 'a',
  'é': 'e', 'è': 'e', 'ë': 'e', 'ê': 'e',
  'í': 'i', 'ì': 'i', 'ï': 'i', 'î': 'i',
  'ó': 'o', 'ò': 'o', 'ö': 'o', 'ô': 'o', 'õ': 'o',
  'ú': 'u', 'ù': 'u', 'ü': 'u', 'û': 'u',
};

function stripAccents(s) {
  return s.split('').map(c => ACCENT_MAP[c] || ACCENT_MAP[c.toLowerCase()] || c).join('');
}

export function normalize(s) {
  return stripAccents(s).toLowerCase().replace(/[''`]/g, '').replace(/\s+/g, ' ').trim();
}

// Simple edit distance for short strings (max 2 edits considered)
function editDist(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

/**
 * Search player names with fuzzy matching.
 * Returns sorted results with best matches first.
 * @param {string} query - User input
 * @param {string[]} names - All player names
 * @param {number} limit - Max results
 */
export function fuzzySearch(query, names, limit = 12) {
  if (!query.trim()) return [];
  const q = normalize(query);
  if (!q) return [];

  const results = [];

  for (const name of names) {
    const norm = normalize(name);
    let score = 0;

    // Exact substring match (best)
    if (norm.includes(q)) {
      score = 100 - (norm.indexOf(q) * 0.1); // Prefer matches at start
      if (norm.startsWith(q)) score += 10;
    }
    // Last name starts with query
    else if (norm.split(' ').some(part => part.startsWith(q))) {
      score = 80;
    }
    // Check each word in query against name words
    else {
      const qWords = q.split(' ');
      const nWords = norm.split(' ');
      let wordMatches = 0;
      for (const qw of qWords) {
        for (const nw of nWords) {
          if (nw.startsWith(qw) || qw.startsWith(nw)) {
            wordMatches++;
            break;
          }
          // Fuzzy: allow 1 edit for words >= 4 chars
          if (qw.length >= 4 && nw.length >= 4 && editDist(qw, nw) <= 1) {
            wordMatches += 0.8;
            break;
          }
        }
      }
      if (wordMatches > 0) {
        score = 40 + (wordMatches / qWords.length) * 30;
      }
    }

    // Fuzzy single-word: if query is one word >= 4 chars, try edit distance on last name
    if (score === 0 && q.length >= 4 && !q.includes(' ')) {
      const lastName = norm.split(' ').pop();
      const dist = editDist(q, lastName);
      if (dist <= 2) {
        score = 30 - dist * 10;
      }
    }

    if (score > 0) {
      results.push({ name, score });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => r.name);
}
