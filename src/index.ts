export default {
  async fetch(request, env) {
    const inputs = {
      prompt: "Front-facing portrait of an Egyptian queen, 105mm lens, golden tones, painted eyeliner, royal headdress, studio lighting, digital oil painting, museum-style realism, soft background blur, sharp facial detail.",
    };

    const response = await env.AI.run(
      "@cf/stabilityai/stable-diffusion-xl-base-1.0",
      inputs,
    );

    return new Response(response, {
      headers: {
        "content-type": "image/png",
      },
    });
  },
} satisfies ExportedHandler<Env>;
