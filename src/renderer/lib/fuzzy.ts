/** startsWith > word-boundary > includes > subsequence. 0 = no match. */
export function fuzzyScore(title: string, q: string): number {
  const t = title.toLowerCase()
  if (t.startsWith(q)) return 100
  if (t.includes(` ${q}`)) return 80
  if (t.includes(q)) return 60
  // subsequence: every char of q appears in order ("grlk" → "Grelka")
  let i = 0
  for (const ch of t) if (ch === q[i]) i++
  return i === q.length ? 30 : 0
}
