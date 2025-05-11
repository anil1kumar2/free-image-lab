interface Env {
  AI: any;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    const renderPage = (content: string, title: string) => `<!DOCTYPE html>
<html>
<head>
  <title>${title} - Image Lab</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root {
      --primary: #7c3aed;
      --background: #f0f4ff;
      --card-bg: #ffffff;
      --error: #dc2626;
      --text: #333;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--background);
      color: var(--text);
      margin: 0;
      padding: 2rem;
      line-height: 1.5;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    .nav {
      display: flex;
      gap: 1.5rem;
      margin-bottom: 2rem;
      padding: 1rem;
      background: var(--card-bg);
      border-radius: 0.5rem;
    }
    .nav a {
      color: var(--text);
      text-decoration: none;
      font-weight: 500;
    }
    .nav a:hover { color: var(--primary); }
    .card {
      background: var(--card-bg);
      border-radius: 1rem;
      padding: 2rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    form { margin-top: 1.5rem; }
    input, button {
      padding: 0.8rem;
      border-radius: 0.5rem;
      font-size: 1rem;
      width: 100%;
      max-width: 500px;
    }
    input {
      border: 2px solid #e2e8f0;
      margin-bottom: 1rem;
    }
    button {
      background: var(--primary);
      color: white;
      border: none;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    button:hover { opacity: 0.9; }
    .result-img {
      max-width: 100%;
      height: auto;
      margin-top: 2rem;
      border-radius: 0.5rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    .error { color: var(--error); margin-top: 1rem; }
    .loading { display: none; text-align: center; margin: 2rem 0; }
  </style>
  <script>
    function showLoading() {
      document.querySelector('.loading').style.display = 'block';
    }
  </script>
</head>
<body>
  <div class="container">
    <nav class="nav">
      <a href="/">Home</a>
      <a href="/generate">Generate</a>
      <a href="/remove">Remove BG</a>
    </nav>
    <div class="loading">Processing... ⏳</div>
    ${content}
  </div>
</body>
</html>`;

    try {
      // Handle GET requests
      if (request.method === 'GET') {
        switch (path) {
          case '/':
            return new Response(renderPage(`
              <div class="card">
                <h1>Image Lab</h1>
                <div style="display: grid; gap: 1rem; margin-top: 2rem;">
                  <a href="/generate" class="card" style="text-decoration: none;">
                    <h2>🎨 Generate Image</h2>
                    <p>Create new images from text prompts</p>
                  </a>
                  <a href="/remove" class="card" style="text-decoration: none;">
                    <h2>✂️ Remove Background</h2>
                    <p>Make image backgrounds transparent</p>
                  </a>
                </div>
              </div>
            `, 'Home'), { headers: { 'Content-Type': 'text/html' } });

          case '/generate':
            return new Response(renderPage(`
              <div class="card">
                <h1>Generate Image</h1>
                <form action="/generate" method="POST" onsubmit="showLoading()">
                  <input type="text" name="prompt" placeholder="A sunset over mountains..." required>
                  <button type="submit">Generate Image</button>
                </form>
              </div>
            `, 'Generate Image'), { headers: { 'Content-Type': 'text/html' } });

          case '/remove':
            return new Response(renderPage(`
              <div class="card">
                <h1>Remove Background</h1>
                <form action="/remove" method="POST" enctype="multipart/form-data" onsubmit="showLoading()">
                  <input type="file" name="image" accept="image/*" required>
                  <button type="submit" style="margin-top: 1rem">Remove Background</button>
                </form>
                <p class="error">Max file size: 3MB (PNG/JPEG)</p>
              </div>
            `, 'Remove Background'), { headers: { 'Content-Type': 'text/html' } });

          default:
            return new Response('Not Found', { status: 404 });
        }
      }

      // Handle POST requests
      if (request.method === 'POST') {
        if (path === '/generate') {
          const formData = await request.formData();
          const prompt = formData.get('prompt')?.toString().trim() || '';

          if (!prompt) return new Response('Prompt is required', { status: 400 });
          if (prompt.length > 500) return new Response('Prompt too long (max 500 chars)', { status: 400 });

          // Generate image with safe parameters
          const image = await env.AI.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
            prompt,
            negative_prompt: 'blurry, distorted, text, watermark',
            num_steps: 20,
            width: 1024,
            height: 1024
          });

          const buffer = await image.arrayBuffer();
          const base64Image = arrayBufferToBase64(buffer);

          return new Response(renderResult(base64Image, 'Generated Image'), {
            headers: { 'Content-Type': 'text/html' }
          });

        } else if (path === '/remove') {
          const formData = await request.formData();
          const file = formData.get('image') as File | null;

          if (!file) return new Response('No image uploaded', { status: 400 });
          if (file.size > 3 * 1024 * 1024) return new Response('File too large (max 3MB)', { status: 400 });

          // Process image
          const buffer = await file.arrayBuffer();
          const base64Image = arrayBufferToBase64(buffer);

          // For production: Replace with actual background removal API
          const processedImage = await mockBackgroundRemoval(base64Image);

          return new Response(renderResult(processedImage, 'Background Removed'), {
            headers: { 'Content-Type': 'text/html' }
          });
        }
      }

      return new Response('Method Not Allowed', { status: 405 });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return new Response(renderPage(`
        <div class="card">
          <h2>⚠️ Error</h2>
          <p class="error">${errorMessage}</p>
          <a href="/">← Back to Home</a>
        </div>
      `, 'Error'), { status: 500, headers: { 'Content-Type': 'text/html' } });
    }
  },
};

// Helper functions
function renderResult(image: string, title: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Result - Image Lab</title>
  <style>
    /* Same styles as main page */
  </style>
</head>
<body>
  <div class="container">
    <nav class="nav">
      <a href="/">Home</a>
      <a href="/generate">Generate</a>
      <a href="/remove">Remove BG</a>
    </nav>
    <div class="card">
      <h1>${title}</h1>
      <img src="data:image/png;base64,${image}" class="result-img">
      <div style="margin-top: 2rem;">
        <a href="/" class="button">← Create Another</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 32768;
  let output = '';
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    output += String.fromCharCode(...chunk);
  }
  
  return btoa(output);
}

// Mock background removal - replace with actual implementation
async function mockBackgroundRemoval(base64Image: string): Promise<string> {
  // In production: Implement with WASM library or external API
  return base64Image;
}
