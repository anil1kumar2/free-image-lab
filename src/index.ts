export default {
  async fetch(request, env) {
    const inputs = {
      prompt: "Ultra-sharp 8K image of a cascading jungle waterfall, water droplets frozen mid-air, surrounding foliage dripping wet, Canon EOS R5 + RF 15–35 mm L, 1/200 s shutter, polarizing filter, ISO 100, rich emerald palette, natural overcast light.",
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
