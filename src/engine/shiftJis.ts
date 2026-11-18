import Encoding from 'encoding-japanese';

/**
 * Shift_JIS (CP932) encoding utilities for MMD VPD and VMD files.
 * VMD bone and morph names are strictly limited to 15 bytes in Shift_JIS.
 */

export function encodeShiftJIS(text: string): Uint8Array {
  const unicodeArray = Encoding.stringToCode(text);
  const sjisArray = Encoding.convert(unicodeArray, {
    to: 'SJIS',
    from: 'UNICODE',
  });
  return Uint8Array.from(sjisArray);
}

export function decodeShiftJIS(bytes: Uint8Array): string {
  // Trim at first null byte if present
  let end = bytes.indexOf(0);
  if (end === -1) end = bytes.length;
  const sliced = Array.from(bytes.subarray(0, end));
  const unicodeArray = Encoding.convert(sliced, {
    to: 'UNICODE',
    from: 'SJIS',
  });
  return Encoding.codeToString(unicodeArray);
}

export function getShiftJISByteLength(text: string): number {
  return encodeShiftJIS(text).length;
}

export function validateVMDName(name: string, maxBytes = 15): {
  valid: boolean;
  byteLength: number;
  exceedsLimit: boolean;
  lossyEncoding: boolean;
  reason?: string;
} {
  const encoded = encodeShiftJIS(name);
  const decoded = decodeShiftJIS(encoded);
  const lossyEncoding = decoded !== name;
  const exceedsLimit = encoded.length > maxBytes;
  const valid = !exceedsLimit && !lossyEncoding && name.length > 0;

  let reason: string | undefined;
  if (name.length === 0) {
    reason = 'Name is empty.';
  } else if (exceedsLimit) {
    reason = `Shift_JIS byte length (${encoded.length}) exceeds VMD ${maxBytes}-byte limit.`;
  } else if (lossyEncoding) {
    reason = 'Contains characters that cannot be round-tripped in Shift_JIS.';
  }

  return {
    valid,
    byteLength: encoded.length,
    exceedsLimit,
    lossyEncoding,
    reason,
  };
}

export function encodeFixedShiftJIS(
  text: string,
  fixedByteSize: number
): { bytes: Uint8Array; truncated: boolean; byteLength: number } {
  const raw = encodeShiftJIS(text);
  const out = new Uint8Array(fixedByteSize);
  const len = Math.min(raw.length, fixedByteSize);
  out.set(raw.subarray(0, len), 0);
  return {
    bytes: out,
    truncated: raw.length > fixedByteSize,
    byteLength: raw.length,
  };
}
