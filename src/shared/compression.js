// Deflate helpers built on the platform CompressionStream API (Chrome 103+,
// Node 21+). Results are stored compressed so a whole batch fits inside the
// in-memory chrome.storage.session quota.

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

async function pipeBytes(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  const buffer = await new Response(stream).arrayBuffer();

  return new Uint8Array(buffer);
}

export function deflateRaw(bytes) {
  return pipeBytes(bytes, new CompressionStream('deflate-raw'));
}

export function inflateRaw(bytes) {
  return pipeBytes(bytes, new DecompressionStream('deflate-raw'));
}

export function bytesToBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export async function compressText(text) {
  const compressed = await deflateRaw(textEncoder.encode(text));

  return bytesToBase64(compressed);
}

export async function decompressText(base64) {
  const bytes = await inflateRaw(base64ToBytes(base64));

  return textDecoder.decode(bytes);
}
