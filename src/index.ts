export default {
  async fetch(request, env) {
    const inputs = {
      prompt: "Grim portrait of a post-apocalyptic survivor, 50mm lens, gritty lighting, torn clothing, ash-covered skin, desaturated colors, scratched goggles, digital painting with cinematic grain, raw emotional expression.",
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
