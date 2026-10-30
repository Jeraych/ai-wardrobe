const { generateImage, downloadReference } = require('../lib/openaiImage');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; delete process.env.OPENAI_API_KEY; });
test('missing key fails before network', async () => {
  delete process.env.OPENAI_API_KEY;
  global.fetch = jest.fn();
  await expect(generateImage([{buffer: Buffer.from('x'), type:'image/png'}], 'test')).rejects.toThrow('OPENAI_API_KEY');
  expect(global.fetch).not.toHaveBeenCalled();
});
test('sends multipart references, decodes image, preserves usage', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  global.fetch = jest.fn().mockResolvedValue({ok:true, headers:new Headers({'x-request-id':'req-test'}), json:async()=>({data:[{b64_json:Buffer.from('result').toString('base64')}],usage:{total_tokens:20}})});
  const result = await generateImage([{buffer:Buffer.from('person'),type:'image/png'}, {buffer:Buffer.from('shirt'),type:'image/jpeg'}], 'wear shirt');
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe('https://api.openai.com/v1/images/edits');
  expect(options.body.getAll('image[]')).toHaveLength(2);
  expect(options.body.get('n')).toBe('1');
  expect(result.buffer.toString()).toBe('result');
  expect(result.usage.total_tokens).toBe(20);
});
test('does not retry or expose provider error content', async () => {
  process.env.OPENAI_API_KEY='test-key';
  global.fetch=jest.fn().mockResolvedValue({ok:false,status:429,headers:new Headers({'x-request-id':'req-test'}),json:async()=>({error:{message:'private provider detail',code:'rate_limit_exceeded',type:'rate_limit_error'}})});
  await expect(generateImage([{buffer:Buffer.from('x'),type:'image/png'}], 'test')).rejects.toThrow('HTTP 429');
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
test('rejects arbitrary reference hosts before fetching', async () => {
  global.fetch=jest.fn();
  await expect(downloadReference('http://127.0.0.1/private')).rejects.toThrow('Cloudinary');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('sniffs real format instead of trusting a jpg extension', () => {
 const {imageType}=require('../lib/openaiImage');
 expect(imageType(Buffer.from('RIFF1234WEBPVP8 '))).toBe('image/webp');
 expect(()=>imageType(Buffer.from('....ftypavif'))).toThrow('convert AVIF');
});

test('retains safe diagnostics without provider message', async () => {
 process.env.OPENAI_API_KEY='test-key';
 global.fetch=jest.fn().mockResolvedValue({ok:false,status:400,headers:new Headers({'x-request-id':'req-safe'}),json:async()=>({error:{code:'invalid_request',type:'invalid_request_error',message:'SECRET CONTENT'}})});
 try { await generateImage([{buffer:Buffer.from('x'),type:'image/png'}],'test'); throw new Error('expected rejection'); }
 catch(error) { expect(error.providerStatus).toBe(400);expect(error.providerCode).toBe('invalid_request');expect(error.requestId).toBe('req-safe');expect(error.message).not.toContain('SECRET CONTENT'); }
});


test.each([[400, true], [429, true], [408, false], [500, false], [503, false]])(
 'classifies provider HTTP %i completion conservatively', async (status, generationSettled) => {
  process.env.OPENAI_API_KEY = 'test-key';
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status, headers: new Headers(), json: async () => ({ error: {} }) });
  await expect(generateImage([{ buffer: Buffer.from('x'), type: 'image/png' }], 'test'))
    .rejects.toMatchObject({ generationSettled });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
test('preflight validation is a confirmed no-submission failure', async () => {
 process.env.OPENAI_API_KEY = 'test-key';
 global.fetch = jest.fn();
 await expect(generateImage([], 'test')).rejects.toMatchObject({ status: 400, generationSettled: true });
 expect(global.fetch).not.toHaveBeenCalled();
});
test('a transport timeout remains unknown and is not retried', async () => {
 process.env.OPENAI_API_KEY = 'test-key';
 const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
 global.fetch = jest.fn().mockRejectedValue(timeout);
 await expect(generateImage([{ buffer: Buffer.from('x'), type: 'image/png' }], 'test')).rejects.toBe(timeout);
 expect(timeout.generationSettled).toBeUndefined();
 expect(global.fetch).toHaveBeenCalledTimes(1);
});


const jpegBytes = Buffer.from([255, 216, 255, 224, 0, 0]);
const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const webpBytes = Buffer.from('RIFF1234WEBPVP8 ');
const avifBytes = Buffer.from('\x00\x00\x00\x18ftypavif\x00\x00\x00\x00avif');
const sourceUrl = 'https://res.cloudinary.com/test/image/upload/v123/folder/renamed.jpg';
const imageResponse = (buffer, type) => new Response(buffer, { headers: { 'content-type': type } });

test.each([['image/jpeg', jpegBytes], ['image/png', pngBytes], ['image/webp', webpBytes]])(
 'normal %s references require exactly one download and keep their actual format', async (type, buffer) => {
  global.fetch = jest.fn().mockResolvedValue(imageResponse(buffer, type));
  await expect(downloadReference(sourceUrl)).resolves.toEqual({ buffer, type });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
test.each(['image/avif', 'application/octet-stream'])(
 'AVIF bytes delivered as %s are converted to real JPEG through Cloudinary', async (type) => {
  global.fetch = jest.fn().mockResolvedValueOnce(imageResponse(avifBytes, type))
    .mockResolvedValueOnce(imageResponse(jpegBytes, 'image/jpeg'));
  await expect(downloadReference(sourceUrl)).resolves.toEqual({ buffer: jpegBytes, type: 'image/jpeg' });
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(String(global.fetch.mock.calls[1][0])).toBe('https://res.cloudinary.com/test/image/upload/f_jpg/v123/folder/renamed.jpg');
  for (const [, options] of global.fetch.mock.calls) expect(options.redirect).toBe('error');
});
test('HEIC bytes are converted without pretending the original is JPEG', async () => {
 const heic = Buffer.from('\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1');
 global.fetch = jest.fn().mockResolvedValueOnce(imageResponse(heic, 'image/heic'))
  .mockResolvedValueOnce(imageResponse(jpegBytes, 'image/jpeg'));
 await expect(downloadReference(sourceUrl)).resolves.toEqual({ buffer: jpegBytes, type: 'image/jpeg' });
 expect(global.fetch).toHaveBeenCalledTimes(2);
});
test('conversion removes f_auto and makes JPEG the final transformation', async () => {
 global.fetch = jest.fn().mockResolvedValueOnce(imageResponse(avifBytes, 'image/avif'))
  .mockResolvedValueOnce(imageResponse(jpegBytes, 'image/jpeg'));
 await downloadReference('https://res.cloudinary.com/test/image/upload/f_auto,q_auto/c_fill,w_100/v123/folder/renamed.jpg');
 expect(String(global.fetch.mock.calls[1][0])).toBe('https://res.cloudinary.com/test/image/upload/q_auto/c_fill,w_100/f_jpg/v123/folder/renamed.jpg');
});
test('octet-stream with real JPEG magic is accepted without an extra request', async () => {
 global.fetch = jest.fn().mockResolvedValue(imageResponse(jpegBytes, 'application/octet-stream'));
 await expect(downloadReference(sourceUrl)).resolves.toEqual({ buffer: jpegBytes, type: 'image/jpeg' });
 expect(global.fetch).toHaveBeenCalledTimes(1);
});
test.each([
 ['text/html', Buffer.from('<html>not an image</html>')],
 ['image/jpeg', Buffer.from('<html>not an image</html>')],
 ['image/avif', avifBytes],
 ['image/jpeg', pngBytes],
])('invalid converted content is rejected (%s)', async (type, bytes) => {
 global.fetch = jest.fn().mockResolvedValueOnce(imageResponse(avifBytes, 'image/avif'))
  .mockResolvedValueOnce(imageResponse(bytes, type));
 await expect(downloadReference(sourceUrl)).rejects.toThrow();
 expect(global.fetch).toHaveBeenCalledTimes(2);
});
test('a failed conversion download is rejected without further retries', async () => {
 global.fetch = jest.fn().mockResolvedValueOnce(imageResponse(avifBytes, 'image/avif'))
  .mockResolvedValueOnce(new Response('', { status: 403 }));
 await expect(downloadReference(sourceUrl)).rejects.toThrow('Could not download');
 expect(global.fetch).toHaveBeenCalledTimes(2);
});
test.each(['https://res.cloudinary.com.evil.test/test/image/upload/a.jpg',
 'http://res.cloudinary.com/test/image/upload/a.jpg', 'https://user@res.cloudinary.com/test/image/upload/a.jpg'])(
 'untrusted reference URL never makes a request: %s', async (url) => {
  global.fetch = jest.fn();
  await expect(downloadReference(url)).rejects.toThrow('HTTPS Cloudinary');
  expect(global.fetch).not.toHaveBeenCalled();
});
test('HTML is rejected even with generic binary content type', async () => {
 global.fetch = jest.fn().mockResolvedValue(imageResponse(Buffer.from('<html>not an image</html>'), 'application/octet-stream'));
 await expect(downloadReference(sourceUrl)).rejects.toThrow('Unsupported reference image bytes');
 expect(global.fetch).toHaveBeenCalledTimes(1);
});
test('the converted JPEG is still subject to the final 10 MB limit', async () => {
 const oversized = Buffer.alloc(10 * 1024 * 1024 + 1); jpegBytes.copy(oversized);
 global.fetch = jest.fn().mockResolvedValueOnce(imageResponse(avifBytes, 'image/avif'))
  .mockResolvedValueOnce(imageResponse(oversized, 'image/jpeg'));
 await expect(downloadReference(sourceUrl)).rejects.toThrow('exceeds 10 MB');
});
