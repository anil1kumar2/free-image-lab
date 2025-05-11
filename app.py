from flask import Flask, request, render_template, send_file
import torch
import os
from uuid import uuid4

# Import the two pipelines
from diffusers import FluxPipeline  # FLUX.1 image model
from diffusers import CogVideoXPipeline  # CogVideoX video model

app = Flask(__name__)

# Output directory
OUTPUT_DIR = "outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Device & dtype
device = "cuda" if torch.cuda.is_available() else "cpu"
# FLUX.1 benefits from bfloat16 on supported hardware; fall back to float16
dtype = torch.bfloat16 if device == "cuda" and torch.cuda.is_bf16_supported() else torch.float16

print("Loading FLUX.1 image pipeline...")
flux_pipe = FluxPipeline.from_pretrained(
    "black-forest-labs/FLUX.1-dev",  # FLUX.1-Dev model repo :contentReference[oaicite:0]{index=0}
    torch_dtype=dtype
).to(device)
print("Loading CogVideoX video pipeline...")
video_pipe = CogVideoXPipeline.from_pretrained(
    "THUDM/CogVideoX",               # CogVideoX model repo :contentReference[oaicite:1]{index=1}
    torch_dtype=torch.float16        # video pipelines generally use float16 :contentReference[oaicite:2]{index=2}
).to(device)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/generate_image', methods=['POST'])
def generate_image():
    prompt = request.form.get('prompt', '').strip()
    if not prompt:
        return "❌ No prompt provided", 400

    # Generate image with FLUX.1
    with torch.autocast(device):
        image = flux_pipe(prompt).images[0]

    filename = f"{uuid4().hex}.png"
    path = os.path.join(OUTPUT_DIR, filename)
    image.save(path)
    return render_template('result.html', media_type='image', file=filename, prompt=prompt)

@app.route('/generate_video', methods=['POST'])
def generate_video():
    prompt = request.form.get('prompt', '').strip()
    if not prompt:
        return "❌ No prompt provided", 400

    # Generate video with CogVideoX (defaults: length=16 frames)
    with torch.autocast(device):
        video = video_pipe(prompt).videos[0]

    filename = f"{uuid4().hex}.mp4"
    path = os.path.join(OUTPUT_DIR, filename)
    video.save(path, codec="libx264", fps=8)
    return render_template('result.html', media_type='video', file=filename, prompt=prompt)

@app.route('/outputs/<filename>')
def serve_file(filename):
    mimetype = 'video/mp4' if filename.endswith('.mp4') else 'image/png'
    return send_file(os.path.join(OUTPUT_DIR, filename), mimetype=mimetype)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
