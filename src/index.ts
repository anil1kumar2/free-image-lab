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
        <title>${title} - Free Image Lab</title>
        <style>
          :root {
            --primary: #7c3aed;
            --background: #f0f4ff;
            --card-bg: #ffffff;
            --error: #dc2626;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--background);
            margin: 0;
            padding: 2rem;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
          }
          .card {
            background: var(--card-bg);
            border-radius: 1rem;
            padding: 2rem;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            margin-bottom: 2rem;
          }
          .nav { 
            margin-bottom: 2rem;
            display: flex;
            gap: 1.5rem;
          }
          .nav a {
            color: #666;
            text-decoration: none;
          }
          .nav a:hover { color: var(--primary); }
          form { margin-top: 2rem; }
          input, button {
            padding: 0.8rem;
            border-radius: 0.5rem;
            border: 1px solid #ddd;
            font-size: 1rem;
            width: 100%;
            max-width: 500px;
          }
          button {
            background: var(--primary);
            color: white;
            border: none;
            cursor: pointer;
            transition: opacity 0.2s;
            margin-top: 1rem;
          }
          button:hover { opacity: 0.9; }
          .result-img {
            max-width: 100%;
            height: auto;
            margin-top: 2rem;
            border-radius: 0.5rem;
          }
          .error { color: var(--error); }
          .loading {
            display: none;
            margin: 2rem 0;
            text-align: center;
          }
        </style>
        <script>
          function showLoading() {
            document.getElementById('loading').style.display = 'block';
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
          <div id="loading" class="loading">Processing...</div>
          ${content}
        </div>
      </body>
      </html>`;

    try {
      if (request.method === 'GET') {
        switch (path) {
          case '/':
            return new Response(renderPage(`
              <div class="card">
                <h1>Welcome to Free Image Lab</h1>
                <p>Choose a tool:</p>
                <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                  <a href="/generate" style="flex: 1;" class="card">
                    <h2>Generate Image</h2>
                    <p>Create new images using AI</p>
                  </a>
                  <a href="/remove" style="flex: 1;" class="card">
                    <h2>Remove Background</h2>
                    <p>Make backgrounds transparent</p>
                  </a>
                </div>
              </div>
            `, 'Home'), { headers: { 'Content-Type': 'text/html' } });

          case '/generate':
            return new Response(renderPage(`
              <div class="card">
                <h1>Generate Image</h1>
                <form action="/generate" method="POST" onsubmit="showLoading()">
                  <input type="text" name="prompt" 
                         placeholder="Describe the image you want to create..." 
                         required>
                  <button type="submit">Generate Image</button>
                </form>
              </div>
            `, 'Generate Image'), { headers: { 'Content-Type': 'text/html' } });

          case '/remove':
            return new Response(renderPage(`
              <div class="card">
                <h1>Remove Background</h1>
                <form action="/remove" method="POST" 
                      enctype="multipart/form-data" 
                      onsubmit="showLoading()">
                  <input type="file" name="image" accept="image/*" required>
                  <button type="submit">Remove Background</button>
                </form>
                <p class="error" style="margin-top: 1rem;">
                  Maximum file size: 3MB (PNG/JPEG)
                </p>
              </div>
            `, 'Remove Background'), { headers: { 'Content-Type': 'text/html' } });

          default:
            return new Response('Not Found', { status: 404 });
        }
      }

      if (request.method === 'POST') {
        if (path === '/generate') {
          const formData = await request.formData();
          const prompt = formData.get('prompt')?.toString().trim() || '';

          if (!prompt) return new Response('Prompt is required', { status: 400 });
          if (prompt.length > 500) {
            return new Response('Prompt too long (max 500 characters)', { status: 400 });
          }

          // Generate image with safe parameters
          const image = await env.AI.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
            prompt,
            negative_prompt: 'blurry, distorted, text, watermark',
            num_steps: 20,  // Fixed to <= 20
            width: 1024,
            height: 1024,
            guidance: 7.5
          });

          const base64Image = await imageToBase64(image);
          return new Response(renderResult(base64Image), { 
            headers: { 'Content-Type': 'text/html' } 
          });

        } else if (path === '/remove') {
          const formData = await request.formData();
          const file = formData.get('image') as File | null;
          
          if (!file) return new Response('Image required', { status: 400 });
          if (file.size > 3 * 1024 * 1024) {
            return new Response('File size exceeds 3MB limit', { status: 400 });
          }

          // Process image in chunks to avoid stack overflow
          const buffer = await file.arrayBuffer();
          const base64Image = arrayBufferToBase64(buffer);

          const response = await fetch('https://freeimagelab.com/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Image })
          });

          if (!response.ok) {
            const error = await response.text();
            throw new Error(`Background removal failed: ${error}`);
          }

          const result = await response.json() as { image: string };
          return new Response(renderResult(result.image), { 
            headers: { 'Content-Type': 'text/html' } 
          });
        }
      }

      return new Response('Method Not Allowed', { status: 405 });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return new Response(renderPage(`
        <div class="card">
          <h2 class="error">Error</h2>
          <p>${errorMessage}</p>
          <a href="/">← Back to Home</a>
        </div>
      `, 'Error'), { status: 500, headers: { 'Content-Type': 'text/html' } });
    }
  },
};

// Helper functions
function renderResult(base64Image: string): string {
  return `<!DOCTYPE html>
    <html>
    <head>
      <title>Result - Free Image Lab</title>
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
          <h1>Your Result</h1>
          <img src="data:image/png;base64,${base64Image}" class="result-img">
          <div style="margin-top: 2rem;">
            <a href="/" class="button">← Create Another</a>
          </div>
        </div>
      </div>
    </body>
    </html>`;
}

async function imageToBase64(image: Response): Promise<string> {
  const buffer = await image.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  // Process in chunks to avoid maximum call stack
  const bytes = new Uint8Array(buffer);
  const chunkSize = 32768; // 32KB chunks
  let output = '';
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    output += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  
  return btoa(output);
}
