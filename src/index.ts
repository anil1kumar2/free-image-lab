export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    // Static frontend from templates
    if (request.method === 'GET') {
      if (pathname === '/' || pathname === '/index') {
        return fetch(`https://freeimagelab.com/templates/index.html`);
      } else if (pathname === '/remove') {
        return fetch(`https://freeimagelab.com/templates/remove.html`);
      } else {
        return fetch(`https://freeimagelab.com/templates${pathname}`);
      }
    }

    // Generate AI image using SDXL
    if (pathname === '/generate' && request.method === 'POST') {
      let body: { prompt?: string };
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
      }

      const prompt = body.prompt?.trim();
      if (!prompt) {
        return new Response(JSON.stringify({ error: 'Missing prompt' }), { status: 400 });
      }

      const image = await env.AI.run(
        "@cf/stabilityai/stable-diffusion-xl-base-1.0",
        { prompt, negative_prompt: "low quality, blurry, distorted" }
      );

      return new Response(image, { headers: { 'Content-Type': 'image/png' } });
    }

    // Background removal proxy
    if (pathname === '/process' && request.method === 'POST') {
      const resp = await fetch('https://freeimagelab.com/process', {
        method: 'POST',
        headers: request.headers,
        body: request.body
      });
      return new Response(resp.body, resp);
    }

    return new Response('Not found', { status: 404 });
  }
};
