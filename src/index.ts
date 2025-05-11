// index.ts
export interface Env {}

// ========================
// EMBEDDED LIBRARY ASSETS
// ========================
const WASM_MODEL = '...base64-encoded-wasm-file...'; // Actual base64 string goes here
const LIBRARY_CODE = `
//...minified @transparent-background/removal code...
// Modified to use embedded WASM instead of file system
function loadModel() {
  return WebAssembly.compile(Uint8Array.from(atob("${WASM_MODEL}"), c => c.charCodeAt(0)));
}
`;

// ========================
// HTML TEMPLATE
// ========================
const HTML_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <title>Background Remover</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    .upload-box { border: 2px dashed #ccc; padding: 2rem; text-align: center; margin: 2rem 0; }
    input[type="file"] { display: none; }
    .upload-btn { 
      background: #7c3aed; color: white; padding: 12px 24px; 
      border-radius: 6px; cursor: pointer; display: inline-block;
    }
    #result { margin-top: 2rem; text-align: center; }
    img { max-width: 100%; height: auto; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>Background Remover</h1>
  <div class="upload-box">
    <label class="upload-btn">
      Upload Image
      <input type="file" id="imageInput" accept="image/*">
    </label>
    <button class="upload-btn" onclick="processImage()">Remove Background</button>
  </div>
  <div id="result"></div>

  <script>
    async function processImage() {
      const file = document.getElementById('imageInput').files[0];
      if (!file) return alert('Please select an image first');
      
      const formData = new FormData();
      formData.append('image', file);

      try {
        const response = await fetch('/process', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) throw new Error(await response.text());
        
        const blob = await response.blob();
        const img = document.createElement('img');
        img.src = URL.createObjectURL(blob);
        document.getElementById('result').innerHTML = '';
        document.getElementById('result').appendChild(img);
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }
  </script>
</body>
</html>
`;

// ========================
// WORKER HANDLERS
// ========================
async function removeBackground(imageBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  // Create virtual environment for the library
  const module = { exports: {} };
  const require = (name: string) => {
    if (name === 'fs') return { readFileSync: () => WASM_MODEL };
    throw new Error('Require not implemented');
  };

  // Evaluate library code
  new Function('exports', 'require', 'module', LIBRARY_CODE)(module.exports, require, module);
  
  // Initialize processor
  const { TransparentBackground } = module.exports as any;
  const processor = new TransparentBackground({
    model: 'base',
    debug: false,
    loadModel: async () => WebAssembly.compile(Uint8Array.from(atob(WASM_MODEL), c => c.charCodeAt(0)))
  });

  // Process image
  const blob = new Blob([new Uint8Array(imageBuffer)]);
  const result = await processor.removeBackground(blob, {
    format: 'png',
    returnType: 'buffer'
  });

  return result;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Serve HTML UI
    if (request.method === 'GET') {
      return new Response(HTML_TEMPLATE, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // Handle image processing
    if (request.method === 'POST' && url.pathname === '/process') {
      try {
        const formData = await request.formData();
        const file = formData.get('image') as File;
        
        if (!file) return new Response('No image uploaded', { status: 400 });
        if (file.size > 4 * 1024 * 1024) {
          return new Response('File size exceeds 4MB limit', { status: 400 });
        }

        const imageBuffer = await file.arrayBuffer();
        const processed = await removeBackground(imageBuffer);
        
        return new Response(processed, {
          headers: { 
            'Content-Type': 'image/png',
            'Content-Disposition': 'attachment; filename="no-bg.png"'
          }
        });
      } catch (error) {
        return new Response(`Processing failed: ${error.message}`, { status: 500 });
      }
    }

    return new Response('Not found', { status: 404 });
  }
};
