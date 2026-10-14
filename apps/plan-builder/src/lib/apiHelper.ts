/**
 * Returns the proper API URL taking into account Next.js basePath (/coach)
 */
export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined') {
    if (window.location.pathname.startsWith('/coach')) {
      return `/coach${cleanPath}`;
    }
  }
  return cleanPath;
}
