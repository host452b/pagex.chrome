import { deflateRaw } from './compression.js';

// Minimal ZIP writer (deflate or store, UTF-8 names, no ZIP64). Enough for a
// batch of JSON files and avoids bundling a third-party library into the
// extension.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;

    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    table[n] = c >>> 0;
  }

  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;

  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);

  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

const UTF8_FLAG = 0x0800;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

/**
 * @param {{ name: string, data: string | Uint8Array }[]} entries
 * @param {{ date?: Date, compress?: boolean }} [options]
 * @returns {Promise<Uint8Array>}
 */
export async function createZip(entries, { date = new Date(), compress = true } = {}) {
  const encoder = new TextEncoder();
  const { time, date: dosDate } = toDosDateTime(date);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data =
      typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
    const checksum = crc32(data);
    let method = METHOD_STORE;
    let payload = data;

    if (compress && data.length > 0) {
      const deflated = await deflateRaw(data);

      if (deflated.length < data.length) {
        method = METHOD_DEFLATE;
        payload = deflated;
      }
    }

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, UTF8_FLAG, true);
    local.setUint16(8, method, true);
    local.setUint16(10, time, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, checksum, true);
    local.setUint32(18, payload.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, UTF8_FLAG, true);
    central.setUint16(10, method, true);
    central.setUint16(12, time, true);
    central.setUint16(14, dosDate, true);
    central.setUint32(16, checksum, true);
    central.setUint32(20, payload.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true);
    central.setUint16(34, 0, true);
    central.setUint16(36, 0, true);
    central.setUint32(38, 0, true);
    central.setUint32(42, offset, true);

    localParts.push(new Uint8Array(local.buffer), nameBytes, payload);
    centralParts.push(new Uint8Array(central.buffer), nameBytes);
    offset += 30 + nameBytes.length + payload.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, 0, true);

  const parts = [...localParts, ...centralParts, new Uint8Array(end.buffer)];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let cursor = 0;

  for (const part of parts) {
    output.set(part, cursor);
    cursor += part.length;
  }

  return output;
}
