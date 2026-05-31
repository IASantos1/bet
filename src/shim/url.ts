export function fileURLToPath(url: URL | string): string {
  if (url instanceof URL) {
    return url.pathname;
  }
  return String(url);
}
export const pathToFileURL = (path: string) => new URL('file://' + path);