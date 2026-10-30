// Node 22+ native fetch/FormData; no automatic retries for billable generation.
async function generateImage(images, prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === 'YOUR_OPENAI_API_KEY') {
    throw Object.assign(new Error('Set OPENAI_API_KEY in backend/.env'), { status: 503, generationSettled: true });
  }
  if (!images.length || images.length > 7) {
    throw Object.assign(new Error('Provide 1 to 7 reference images'), { status: 400, generationSettled: true });
  }
  const form = new FormData();
  form.set('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2');
  form.set('quality', process.env.OPENAI_IMAGE_QUALITY || 'low');
  form.set('size', '1024x1024');
  form.set('n', '1');
  form.set('output_format', 'webp');
  form.set('prompt', prompt);
  for (const [i, image] of images.entries()) {
    form.append('image[]', new Blob([image.buffer], { type: image.type }), `reference-${i}.${image.type.split('/')[1]}`);
  }
  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
    signal: AbortSignal.timeout(240000),
  });
  const body = await response.json();
  if (!response.ok) {
    // Do not forward provider messages, which can contain request content or credentials.
    const error = new Error(`OpenAI image request failed (HTTP ${response.status}); check model access, credits and configuration. No automatic retry.`);
    error.status = response.status === 429 ? 429 : 502;
    error.generationSettled = response.status >= 400 && response.status < 500 && response.status !== 408;
    error.providerStatus = response.status;
    const safeCode = value => typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,100}$/.test(value) ? value : null;
    error.providerCode = safeCode(body.error?.code);
    error.providerType = safeCode(body.error?.type);
    error.requestId = safeCode(response.headers?.get?.('x-request-id'));
    throw error;
  }
  if (!body.data?.[0]?.b64_json) {
    const error = new Error('OpenAI returned no image');
    error.generationSettled = true;
    throw error;
  }
  return { buffer: Buffer.from(body.data[0].b64_json, 'base64'), usage: body.usage,
    requestId: response.headers.get('x-request-id') };
}

const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const SOURCE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp',
  'image/avif', 'image/heic', 'image/heif', 'image/gif', 'image/bmp', 'image/tiff', 'application/octet-stream']);

function cloudinaryJpegUrl(url) {
  const result = new URL(url);
  const match = result.pathname.match(/^(\/[^/]+\/image\/upload\/)(.+)$/);
  if (!match) throw new Error('Image conversion requires a Cloudinary image upload URL');
  const parts = match[2].split('/');
  const versionIndex = parts.findIndex(part => /^v\d+$/.test(part));
  const transformPart = /^(?:(?:a|ar|b|bo|c|co|cs|d|dn|dpr|e|f|fl|g|h|if|l|o|p|pg|q|r|t|u|w|x|y|z|zoom)_|\$)/;
  let transformCount = versionIndex >= 0 ? versionIndex : 0;
  if (versionIndex < 0) {
    while (transformCount < parts.length - 1 && parts[transformCount].split(',').every(token => transformPart.test(token))) transformCount++;
  }
  // Remove auto negotiation and make JPEG the last transformation before the asset.
  const transformations = parts.slice(0, transformCount)
    .map(part => part.split(',').filter(token => !/^f_auto(?::.*)?$/.test(token)).join(','))
    .filter(Boolean);
  result.pathname = match[1] + [...transformations, 'f_jpg', ...parts.slice(transformCount)].join('/');
  return result;
}

function convertibleImageBytes(buffer) {
  if (buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brands = buffer.subarray(8, 64).toString('ascii');
    if (['avif', 'avis', 'heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].some(brand => brands.includes(brand))) return true;
  }
  return /^GIF8[79]a/.test(buffer.toString('ascii', 0, 6)) ||
    buffer.toString('ascii', 0, 2) === 'BM' ||
    buffer.subarray(0, 4).equals(Buffer.from([73, 73, 42, 0])) ||
    buffer.subarray(0, 4).equals(Buffer.from([77, 77, 0, 42]));
}

async function fetchReference(url) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Could not download reference image');
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!SOURCE_IMAGE_TYPES.has(type)) {
    await response.body?.cancel();
    throw new Error('Use JPEG, PNG or WebP reference images');
  }
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_REFERENCE_BYTES) throw new Error('Reference image exceeds 10 MB');
    chunks.push(chunk);
  }
  return { buffer: Buffer.concat(chunks), type };
}

async function downloadReference(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.username || url.password || url.port) {
    throw new Error('App image references must be HTTPS Cloudinary URLs');
  }
  const original = await fetchReference(url);
  let actualType;
  try { actualType = imageType(original.buffer); } catch { /* Check known convertible signatures below. */ }
  if (actualType) {
    if (original.type !== actualType && original.type !== 'application/octet-stream') {
      throw new Error('Reference image content type does not match its bytes');
    }
    return { buffer: original.buffer, type: actualType };
  }
  if (!convertibleImageBytes(original.buffer)) throw new Error('Unsupported reference image bytes');
  const converted = await fetchReference(cloudinaryJpegUrl(url));
  if (converted.type !== 'image/jpeg' || imageType(converted.buffer) !== 'image/jpeg') {
    throw new Error('Cloudinary did not return a valid JPEG reference image');
  }
  return converted;
}
module.exports = { generateImage, downloadReference };

// Sniff bytes: downloaded images are often renamed without conversion.
function imageType(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (buffer.toString('ascii',0,4)==='RIFF' && buffer.toString('ascii',8,12)==='WEBP') return 'image/webp';
  throw new Error('Unsupported image bytes: convert AVIF/HEIC or other formats to JPEG, PNG or WebP before running. Renaming is not conversion.');
}
module.exports.imageType = imageType;
