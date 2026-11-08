export function notFoundResponse(request: Request) {
  const fr = new URL(request.url).pathname.startsWith("/fr/");
  const title = fr ? "Page introuvable" : "Page not found";
  const message = fr
    ? "Cette page de documentation n’existe pas."
    : "This documentation page does not exist.";
  return new Response(
    request.method === "HEAD"
      ? null
      : `<!doctype html><html lang="${fr ? "fr" : "en"}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404 · GroupeZ Docs</title><style>:root{color-scheme:light dark;--background:#fff;--text:oklch(14.1% .005 285.823);--blue:oklch(53% .191 258.4)}@media(prefers-color-scheme:dark){:root{--background:oklch(14.1% .005 285.823);--text:oklch(98.5% 0 0);--blue:oklch(71.4% .166 240.7)}}body{margin:0;background:var(--background);color:var(--text);font:16px/1.6 Arial,sans-serif;display:grid;min-height:100vh;place-items:center}main{max-width:40rem;padding:2rem}small,a{color:var(--blue)}h1{font-size:2.5rem;margin:.5rem 0}a{display:inline-block;margin-top:1rem}</style><main><small>404 · GroupeZ Docs</small><h1>${title}</h1><p>${message}</p><a href="${fr ? "/fr" : "/"}">${fr ? "Retour à la documentation" : "Back to documentation"} →</a></main></html>`,
    {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Robots-Tag": "noindex",
      },
    },
  );
}
