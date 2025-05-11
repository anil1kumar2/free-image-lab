export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET') {
      switch (path) {
        case '/':
        case '/index':
          return new Response(indexPage(), { headers: { 'Content-Type': 'text/html' } });
        case '/generate':
          return new Response(generatePage(), { headers: { 'Content-Type': 'text/html' } });
        case '/remove':
          return new Response(removePage(), { headers: { 'Content-Type': 'text/html' } });
        case '/favicon.ico':
          return new Response(favicon(), { headers: { 'Content-Type': 'image/x-icon' } });
        default:
          return new Response('404 Not Found', { status: 404 });
      }
    } else if (request.method === 'POST') {
      if (path === '/generate') {
        const formData = await request.formData();
        const prompt = formData.get('prompt')?.toString().trim();

        if (!prompt) {
          return new Response('Prompt is required.', { status: 400 });
        }

        const image = await env.AI.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
          prompt,
          negative_prompt: 'blurry, distorted',
        });

        const base64Image = await imageToBase64(image);

        return new Response(resultPage(base64Image), { headers: { 'Content-Type': 'text/html' } });
      } else if (path === '/remove') {
        const formData = await request.formData();
        const file = formData.get('image') as File;

        if (!file) {
          return new Response('Image file is required.', { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        const base64 = arrayBufferToBase64(buffer);

        const response = await fetch('https://freeimagelab.com/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 }),
        });

        if (!response.ok) {
          return new Response('Background removal failed.', { status: 500 });
        }

       const result = await response.json() as { image: string };
        const processedImage = result.image; // Assuming the API returns { image: 'base64string' }

        return new Response(resultPage(processedImage), { headers: { 'Content-Type': 'text/html' } });
      }
    }

    return new Response('Method Not Allowed', { status: 405 });
  },
};

function indexPage(): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Free Image Lab</title>
    </head>
    <body>
      <h1>Welcome to Free Image Lab</h1>
      <ul>
        <li><a href="/generate">Generate Image</a></li>
        <li><a href="/remove">Remove Background</a></li>
      </ul>
    </body>
    </html>
  `;
}

function generatePage(): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Generate Image</title>
    </head>
    <body>
      <h1>Generate Image</h1>
      <form action="/generate" method="POST">
        <input type="text" name="prompt" placeholder="Enter prompt" required />
        <button type="submit">Generate</button>
      </form>
    </body>
    </html>
  `;
}

function removePage(): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Remove Background</title>
    </head>
    <body>
      <h1>Remove Background</h1>
      <form action="/remove" method="POST" enctype="multipart/form-data">
        <input type="file" name="image" accept="image/*" required />
        <button type="submit">Remove Background</button>
      </form>
    </body>
    </html>
  `;
}

function resultPage(base64Image: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Result</title>
    </head>
    <body>
      <h1>Result</h1>
      <img src="data:image/png;base64,${base64Image}" alt="Result Image" />
      <br />
      <a href="/">Back to Home</a>
    </body>
    </html>
  `;
}

function favicon(): Uint8Array {
  // Return your favicon binary data here
  return new Uint8Array();
}

async function imageToBase64(image: Response): Promise<string> {
  const buffer = await image.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
