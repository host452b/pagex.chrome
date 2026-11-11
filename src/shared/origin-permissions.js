export function buildOriginPermissionPattern(tabUrl) {
  if (typeof tabUrl !== 'string' || !tabUrl.trim()) {
    return '';
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(tabUrl);
  } catch (error) {
    return '';
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return '';
  }

  if (!parsedUrl.origin || parsedUrl.origin === 'null') {
    return '';
  }

  return `${parsedUrl.origin}/*`;
}

export function collectOriginPatterns(urls) {
  const patterns = new Set();

  for (const url of urls || []) {
    const pattern = buildOriginPermissionPattern(url);

    if (pattern) {
      patterns.add(pattern);
    }
  }

  return Array.from(patterns);
}
