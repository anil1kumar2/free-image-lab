interface Env {
  AI: any;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    const renderPage = (content: string, title: string) => `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title} - Free Image Lab</title>
        <style>
          :root {
            --primary: #7c3aed;
            --background: #f0f4ff;
            --card-bg: #ffffff;
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
          }
          .error { color: #dc2626; }
        </style>
      </head>
      <body>
        <div class="container">
          <nav class="nav">
            <a href="/">Home</a>
            <a href="/generate">Generate</a>
            <a href="/remove">Remove BG</a>
          </nav>
          ${content}
        </div>
      </body>
      </html>
    `;

    try {
      if (request.method === 'GET') {
        switch (path) {
          case '/':
            return new Response(renderPage(`
              <div class="card">
                <h1>Welcome to Free Image Lab</h1>
                <p>Choose a tool:</p>
                <ul>
                  <li><a href="/generate">Generate New Image</a></li>
                  <li><a href="/remove">Remove Background</a></li>
                </ul>
              </div>
            `, 'Home'), { headers: { 'Content-Type': 'text/html' } });

          case '/generate':
            return new Response(renderPage(`
              <div class="card">
                <h1>Generate Image</h1>
                <form action="/generate" method="POST">
                  <input type="text" name="prompt" placeholder="Enter your prompt..." required style="width: 70%">
                  <button type="submit">Generate</button>
                </form>
              </div>
            `, 'Generate Image'), { headers: { 'Content-Type': 'text/html' } });

          case '/remove':
            return new Response(renderPage(`
              <div class="card">
                <h1>Remove Background</h1>
                <form action="/remove" method="POST" enctype="multipart/form-data">
                  <input type="file" name="image" accept="image/*" required>
                  <button type="submit" style="margin-top: 1rem">Remove Background</button>
                </form>
              </div>
            `, 'Remove Background'), { headers: { 'Content-Type': 'text/html' } });

          default:
            return new Response('Not Found', { status: 404 });
        }
      }

      if (request.method === 'POST') {
        if (path === '/generate') {
          const formData = await request.formData();
          const prompt = formData.get('prompt')?.toString().trim();
          
          if (!prompt) return new Response('Prompt is required', { status: 400 });

          const image = await env.AI.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
            prompt,
            negative_prompt: 'blurry, distorted, low quality',
            num_steps: 30
          });

          const base64Image = await imageToBase64(image);
          return new Response(renderResult(base64Image), { 
            headers: { 'Content-Type': 'text/html' } 
          });

        } else if (path === '/remove') {
          const formData = await request.formData();
          const file = formData.get('image') as File | null;
          
          if (!file) return new Response('Image required', { status: 400 });
          if (file.size > 5 * 1024 * 1024) {
            return new Response('File size exceeds 5MB limit', { status: 400 });
          }

          const buffer = await file.arrayBuffer();
          const base64Image = arrayBufferToBase64(buffer);

          const response = await fetch('https://freeimagelab.com/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Image })
          });

          if (!response.ok) {
            const error = await response.text();
            throw new Error(`API Error: ${error}`);
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
          <h2 class="error">Error Processing Request</h2>
          <p>${errorMessage}</p>
          <a href="/">← Back to Home</a>
        </div>
      `, 'Error'), { 
        status: 500, 
        headers: { 'Content-Type': 'text/html' } 
      });
    }
  },
};

function renderResult(base64Image: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Result - Free Image Lab</title>
      <style>
        /* Same styles as renderPage function */
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
          <div style="margin-top: 2rem">
            <a href="/">← Back to Home</a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

async function imageToBase64(image: Response): Promise<string> {
  const buffer = await image.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes));
}
