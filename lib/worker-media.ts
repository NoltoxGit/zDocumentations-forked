type AssetBinding = { fetch(request: Request | string): Promise<Response> };
export type Media = {
  size: number;
  hash: string;
  chunkSize: number;
  contentType: string;
  chunks: string[];
};

// Workers Assets accepts at most 25 MiB per file. Keep the original public URL,
// bytes and video seeking by streaming smaller private asset chunks.
export async function serveMedia(
  request: Request,
  assets: AssetBinding,
  media: Media,
): Promise<Response> {
  if (!["GET", "HEAD"].includes(request.method))
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  const etag = `"${media.hash}"`;
  const headers = new Headers({
    "Content-Type": media.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=0, must-revalidate",
    ETag: etag,
  });
  if (request.headers.get("if-none-match") === etag)
    return new Response(null, { status: 304, headers });
  let start = 0,
    end = media.size - 1,
    status = 200;
  const range = request.headers.get("range");
  const ifRange = request.headers.get("if-range");
  const match =
    range &&
    (!ifRange || ifRange === etag) &&
    range.match(/^bytes=(\d*)-(\d*)$/);
  if (match && request.method === "GET") {
    if (match[1]) {
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), end) : end;
    } else if (match[2]) start = Math.max(0, media.size - Number(match[2]));
    if (
      (!match[1] && !match[2]) ||
      start >= media.size ||
      start > end ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end)
    ) {
      headers.set("Content-Range", `bytes */${media.size}`);
      return new Response(null, { status: 416, headers });
    }
    status = 206;
    headers.set("Content-Range", `bytes ${start}-${end}/${media.size}`);
  }
  headers.set("Content-Length", String(end - start + 1));
  if (request.method === "HEAD") return new Response(null, { headers });
  let index = Math.floor(start / media.chunkSize);
  const last = Math.floor(end / media.chunkSize);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (index <= last) {
          if (!reader) {
            const offset = index * media.chunkSize;
            const response = await assets.fetch(
              new Request(`http://assets.local${media.chunks[index]}`, {
                headers: {
                  Range: `bytes=${Math.max(0, start - offset)}-${Math.min(media.chunkSize - 1, end - offset)}`,
                },
              }),
            );
            // The Assets binding may ignore Range even though the public Assets
            // service supports it. A chunk is bounded to 4 MiB, so slice it here.
            if (response.status === 200) {
              const bytes = new Uint8Array(await response.arrayBuffer());
              controller.enqueue(
                bytes.subarray(
                  Math.max(0, start - offset),
                  Math.min(bytes.length, end - offset + 1),
                ),
              );
              index++;
              return;
            }
            if (response.status !== 206 || !response.body)
              throw new Error(
                `Unable to read media chunk ${index}: HTTP ${response.status}`,
              );
            reader = response.body.getReader();
          }
          const result = await reader.read();
          if (!result.done) {
            controller.enqueue(result.value);
            return;
          }
          reader.releaseLock();
          reader = undefined;
          index++;
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await reader?.cancel();
    },
  });
  return new Response(body, { status, headers });
}
