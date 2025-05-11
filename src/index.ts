export interface Env {
  AI: any;
}

const HTML_HEADER = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>FreeImageLab</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-light: #f0f4ff;
      --primary: #7c3aed;
      --primary-light: #a58df4;
      --text-dark: #222;
      --muted: #666;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Poppins', sans-serif; background: var(--bg-light); color: var(--text-dark); }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    header { background: white; padding: 1rem; box-shadow: 0 2px 5px rgba(0,0,0,0.05); margin-bottom: 2rem; }
    .logo { font-size: 1.5rem; font-weight: 700; color: var(--primary); }
    nav { margin-top: 1rem; }
    nav a { margin-right: 1.5rem; color: var(--muted); text-decoration: none; }
    nav a:hover { color: var(--primary); }
    .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 5px 20px rgba(0,0,0,0.05); }
    .upload-form { margin-top: 2rem; }
    input[type="file"] { display: none; }
    .file-label { 
      display: inline-block; padding: 12px 24px; background: var(--primary); 
      color: white; border-radius: 8px; cursor: pointer; transition: transform 0.2s;
    }
    .file-label:hover { transform: translateY(-2px); }
    .result-img { max-width: 100%; height: auto; margin-top: 2rem; border-radius: 1rem; }
    .download-btn { display: inline-block; margin-top: 1rem; padding: 12px 24px; background: var(--primary-light); color: white; border-radius: 8px; text-decoration: none; }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <div class="logo">FreeImageLab</div>
      <nav>
        <a href="/">Generate</a>
        <a href="/remove">Remove BG</a>
      </nav>
    </div>
  </header>
  <div class="container">
`;

const HTML_FOOTER = `
  </div>
</body>
</html>
`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === 'GET') {
        switch (path) {
          case '/':
            return new Response(HTML_HEADER + generatePage() + HTML_FOOTER, 
              { headers: { 'Content-Type': 'text/html' } });
          
          case '/remove':
            return new Response(HTML_HEADER + removePage() + HTML_FOOTER, 
              { headers: { 'Content-Type': 'text/html' } });
          
          default:
            return new Response('Not found', { status: 404 });
        }
      }

      if (request.method === 'POST') {
        switch (path) {
          case '/generate':
            return handleGenerate(request, env);
          
          case '/remove':
            return handleRemoveBackground(request, env);
        }
      }

      return new Response('Method not allowed', { status: 405 });
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
};

async function handleGenerate(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();
  const prompt = formData.get('prompt')?.toString().trim();

  if (!prompt) return new Response('Prompt required', { status: 400 });

  const image = await env.AI.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
    prompt,
    negative_prompt: 'blurry, distorted',
    num_steps: 30
  });

  const base64 = await arrayBufferToBase64(await image.arrayBuffer());
  return renderResult(base64);
}

async function handleRemoveBackground(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();
  const file = formData.get('image') as File | null;
  
  if (!file) return new Response('Image required', { status: 400 });
  if (file.size > 5 * 1024 * 1024) return new Response('File too large (max 5MB)', { status: 400 });

  const imageBuffer = await file.arrayBuffer();
  const base64Image = arrayBufferToBase64(imageBuffer);

  // Use Cloudflare's native background removal model
  const result = await env.AI.run('@cf/trigger/background-removal', {
    image: base64Image,
    return_png: true
  });

  const processedImage = await result.arrayBuffer();
  return renderResult(arrayBufferToBase64(processedImage));
}

function generatePage(): string {
  return `
    <div class="card">
      <h1>AI Image Generation</h1>
      <form class="upload-form" action="/generate" method="POST">
        <input type="text" name="prompt" placeholder="Describe your image..." required 
               style="width: 100%; padding: 12px; margin-bottom: 1rem; border: 2px solid #ddd; border-radius: 8px;">
        <button type="submit" class="file-label">Generate Image</button>
      </form>
    </div>
  `;
}

function removePage(): string {
  return `
    <div class="card">
      <h1>Background Removal</h1>
      <form class="upload-form" action="/remove" method="POST" enctype="multipart/form-data">
        <label class="file-label">
          Upload Image
          <input type="file" name="image" accept="image/*" required>
        </label>
        <button type="submit" class="file-label" style="margin-top: 1rem">Remove Background</button>
      </form>
    </div>
  `;
}

function renderResult(base64Image: string): Response {
  const html = HTML_HEADER + `
    <div class="card">
      <h1>Your Result</h1>
      <img src="data:image/png;base64,${base64Image}" class="result-img" alt="Result">
      <a href="/" class="download-btn">New Conversion</a>
    </div>
  ` + HTML_FOOTER;

  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}
