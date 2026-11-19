/** Human-friendly file details shared by the packet pages. */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileKind(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('wordprocessingml') || mimeType === 'application/msword') return 'Word';
  if (mimeType.includes('opendocument.text')) return 'OpenDocument';
  return 'File';
}
