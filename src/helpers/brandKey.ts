export function brandKeyFromTitle(title: any): string {
  // 1) Prefer handle prefix if your handles look like "lanza-keratin-healing-oil"
  const handle = String(title?.handle ?? '')
    .toLowerCase()
    .trim();
  if (handle) {
    // brand key = first segment before '-' (or first 2 if you want)
    const first = handle.split('-')[0];
    if (first && first.length >= 3) return first;
  }
  
  // 2) Fallback to title parsing
  return this.brandKeyFromTitle(String(title?.title ?? ''));
}
