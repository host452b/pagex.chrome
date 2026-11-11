function pad(value) {
  return String(value).padStart(2, '0');
}

export function formatFileTimestamp(date) {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function slugify(value, maxLength) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, maxLength)
    .replace(/[-.]+$/g, '');
}

// "https://news.example.com/world/asia/story?id=1" -> "news.example.com-world-asia"
export function buildPageSlug(url) {
  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    return 'page';
  }

  if (parsed.protocol === 'file:') {
    let fileName = parsed.pathname.split('/').filter(Boolean).pop() || 'file';

    try {
      fileName = decodeURIComponent(fileName);
    } catch {
      // Keep the encoded name.
    }

    return slugify(`file-${fileName}`, 60) || 'page';
  }

  const host = slugify(parsed.hostname, 60);
  const pathSegments = parsed.pathname
    .split('/')
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => {
      try {
        return slugify(decodeURIComponent(segment), 30);
      } catch {
        return slugify(segment, 30);
      }
    })
    .filter(Boolean);

  return [host, ...pathSegments].filter(Boolean).join('-') || 'page';
}

export function buildResultFileName(url, date) {
  return `pagex-${buildPageSlug(url)}-${formatFileTimestamp(date)}.json`;
}

export function buildBatchArchiveName(date) {
  return `pagex-batch-${formatFileTimestamp(date)}.zip`;
}

export function buildScreenshotFileName(url, date) {
  return `pagex-screenshot-${buildPageSlug(url)}-${formatFileTimestamp(date)}.png`;
}

export function buildCookiesFileName(url) {
  let host = 'site';

  try {
    host = slugify(new URL(url).hostname, 60) || 'site';
  } catch {
    // Keep default.
  }

  return `cookies-${host}.txt`;
}

// Makes names unique inside one archive: a.json, a-2.json, a-3.json ...
export function dedupeFileNames(names) {
  const seen = new Map();

  return names.map((name) => {
    const count = seen.get(name) || 0;
    seen.set(name, count + 1);

    if (count === 0) {
      return name;
    }

    const dotIndex = name.lastIndexOf('.');
    const stem = dotIndex > 0 ? name.slice(0, dotIndex) : name;
    const extension = dotIndex > 0 ? name.slice(dotIndex) : '';
    let candidate = `${stem}-${count + 1}${extension}`;
    let suffix = count + 1;

    while (seen.has(candidate)) {
      suffix += 1;
      candidate = `${stem}-${suffix}${extension}`;
    }

    seen.set(candidate, 1);

    return candidate;
  });
}
