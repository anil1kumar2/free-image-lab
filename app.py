import os
import uuid
import time
import logging
import gc
import base64
from io import BytesIO

import torch
import numpy as np
import requests
from PIL import Image
from flask import Flask, request, render_template, send_file
from werkzeug.utils import secure_filename
from diffusers import (
    StableDiffusionXLPipeline,
    StableDiffusionXLImg2ImgPipeline,
    DPMSolverMultistepScheduler,
)
from transparent_background import Remover
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
CF_WORKER_URL = os.getenv("CF_WORKER_URL")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("App")

app = Flask(__name__)

# Configuration
OUTPUT_DIR = "static/output"
UPLOAD_FOLDER = os.path.join('static', 'uploads')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Device configuration
device = "cuda" if torch.cuda.is_available() else "cpu"
dtype = torch.float16 if device == "cuda" else torch.float32
torch.backends.cuda.matmul.allow_tf32 = True


def sanitize_image(image: Image.Image) -> Image.Image:
    if not isinstance(image, Image.Image):
        image = Image.fromarray(np.array(image))
    image = image.convert("RGB")
    image = image.resize((1024, 1024))
    return image


def create_remover(mode: str = 'base') -> Remover:
    return Remover(device=device, mode=mode, jit=False)


def image_to_base64(img: Image.Image) -> str:
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
    return f"data:image/png;base64,{img_str}"


@app.route('/')
def index():
    return render_template('generate.html', output_image=None, result_page=False)
WORKER_URL = os.getenv("CF_WORKER_URL", "https://freeimagelab.com/")

@app.route('/generate', methods=['POST'])
def generate():
    prompt = request.form.get("prompt", "").strip()
    if not prompt:
        return "❌ No prompt provided", 400

    logger.info(f"🎨 Sending prompt to Cloudflare Worker: {prompt}")
    try:
        # Proxy to CF Worker
        resp = requests.post(
            CF_WORKER_URL,
            json={"prompt": prompt},
            timeout=60
        )
        if resp.status_code != 200 or 'image/png' not in resp.headers.get('content-type', ''):
            logger.error(f"Worker error: {resp.status_code} {resp.text}")
            return "❌ Generation failed at Worker", 500

        # Decode response into PIL
        img = Image.open(BytesIO(resp.content))
        img = sanitize_image(img)

        # Encode for browser
        output_image_base64 = image_to_base64(img)
        return render_template(
            "generate.html",
            output_image=output_image_base64,
            prompt=prompt,
            result_page=True
        )

    except Exception as e:
        logger.error(f"❌ Error during generation proxy: {e}")
        return "❌ Generation failed - Internal error", 500

    finally:
        try:
            del img
        except:
            pass
        gc.collect()
        torch.cuda.empty_cache()


@app.route('/remove')
def remove():
    return render_template('remove.html', output_image=None, result_page=False)


@app.route('/process', methods=['POST'])
def process_image():
    if 'image' not in request.files:
        return 'No file part', 400
    file = request.files['image']
    if file.filename == '':
        return 'No selected file', 400

    filename = secure_filename(file.filename)
    input_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(input_path)

    try:
        start_time = time.time()
        with Image.open(input_path) as img:
            img = img.convert('RGB')
            remover = create_remover()
            final_output = remover.process(img, type='rgba')

        elapsed_time = time.time() - start_time
        output_image_base64 = image_to_base64(final_output)

        return render_template(
            'remove.html',
            output_image=output_image_base64,
            elapsed_time=round(elapsed_time, 2),
            result_page=True
        )
    except Exception as e:
        logger.error(f"❌ Error during background removal: {e}")
        return f"Error: {e}", 500
    finally:
        try:
            del final_output
        except:
            pass
        gc.collect()
        torch.cuda.empty_cache()


@app.route('/outputs/<filename>')
def serve_image(filename):
    return send_file(os.path.join(OUTPUT_DIR, filename), mimetype="image/png")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv('PORT', 4000)), debug=True)
