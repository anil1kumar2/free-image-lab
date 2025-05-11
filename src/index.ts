export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const { pathname } = new URL(request.url);

    // Serve homepage as HTML
    if (pathname === '/' || pathname === '/index') {
      return new Response(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>Free Image Lab</title>
          <link rel="icon" href="/favicon.ico" />
        </head>
        <body>
          <h1>Free Image Lab</h1>
          <form action="/generate" method="POST">
            <input type="text" name="prompt" placeholder="Enter a prompt" required />
            <button type="submit">Generate Image</button>
          </form>
        </body>
        </html>
      `, {
        headers: { "Content-Type": "text/html" }
      });
    }

    // Serve favicon
    if (pathname === '/favicon.ico') {
      // Replace with actual binary if needed
      return new Response("ICO_PLACEHOLDER", {
        status: 200,
        headers: {
          "Content-Type": "image/x-icon",
          "Cache-Control": "public, max-age=31536000"
        }
      });
    }

    // Handle image generation via AI
    if (pathname === '/generate' && request.method === 'POST') {
      const formData = await request.formData();
      const prompt = formData.get("prompt")?.toString().trim();

      if (!prompt) {
        return new Response("Missing prompt", { status: 400 });
      }

      const image = await env.AI.run("@cf/stabilityai/stable-diffusion-xl-base-1.0", {
        prompt,
        negative_prompt: "blurry, distorted"
      });

      return new Response(image, {
        headers: { "Content-Type": "image/png" }
      });
    }

    // Background removal proxy (if needed)
    if (pathname === '/process' && request.method === 'POST') {
      const resp = await fetch('https://freeimagelab.com/process', {
        method: 'POST',
        headers: request.headers,
        body: request.body
      });
      return new Response(resp.body, resp);
    }

    return new Response('404 Not Found', { status: 404 });
  }
};
