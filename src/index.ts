export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Use POST with JSON {"prompt": "..."}', { status: 400 });
    }
    let { prompt } = await request.json();
    if (!prompt || typeof prompt !== 'string') {
      return new Response('Invalid prompt', { status: 400 });
    }

    const response = await env.AI.run(
      "@cf/stabilityai/stable-diffusion-xl-base-1.0",
      { prompt, negative_prompt: "low quality, blurry, distorted" }
    );

    return new Response(response, {
      headers: { "content-type": "image/png" }
    });
  },
};
