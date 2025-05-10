import os
import uuid
import time
import torch
import logging
from flask import Flask, request, render_template, send_file
from werkzeug.utils import secure_filename
from PIL import Image
from diffusers import StableDiffusionXLPipeline, StableDiffusionXLImg2ImgPipeline, DPMSolverMultistepScheduler
from transparent_background import Remover
import numpy as np
import gc
import base64
from io import BytesIO

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

def sanitize_image(image):
    if not isinstance(image, Image.Image):
        image = Image.fromarray(np.array(image))
    image = image.convert("RGB")
    image = image.resize((1024, 1024))
    return image

def create_remover(mode='base'):
    return Remover(device=device, mode=mode, jit=False)

def image_to_base64(img):
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
    return f"data:image/png;base64,{img_str}"

@app.route('/')
def index():
    return render_template('generate.html', output_image=None, result_page=False)

@app.route('/generate', methods=['POST'])
def generate():
    prompt = request.form.get("prompt", "").strip()
    if not prompt:
        return "❌ No prompt provided", 400

    logger.info(f"🎨 Generating image for prompt: {prompt}")
    try:
        # Load base model
        logger.info("⚙️ Loading base model...")
        base_pipe = StableDiffusionXLPipeline.from_pretrained(
            "stabilityai/stable-diffusion-xl-base-1.0",
            torch_dtype=dtype,
            variant="fp16",
            use_safetensors=True,
            add_watermarker=False
        ).to(device)

        base_pipe.scheduler = DPMSolverMultistepScheduler.from_config(
            base_pipe.scheduler.config,
            use_karras_sigmas=True,
            algorithm_type="sde-dpmsolver++"
        )
        base_pipe.enable_xformers_memory_efficient_attention()

        # Generate latent image
        with torch.inference_mode():
            base_output = base_pipe(
                prompt=prompt,
                negative_prompt="low quality, blurry, distorted",
                num_inference_steps=25,
                guidance_scale=7.0,
                denoising_end=0.8,
                output_type="latent",
                height=1024,
                width=1024
            )

        del base_pipe
        gc.collect()
        torch.cuda.empty_cache()

        # Load refiner
        logger.info("🪄 Loading refiner...")
        refiner_pipe = StableDiffusionXLImg2ImgPipeline.from_pretrained(
            "stabilityai/stable-diffusion-xl-refiner-1.0",
            torch_dtype=dtype,
            variant="fp16",
            use_safetensors=True,
            add_watermarker=False
        ).to(device)

        refiner_pipe.enable_xformers_memory_efficient_attention()

        # Refine image
        with torch.inference_mode():
            refined_output = refiner_pipe(
                prompt=prompt,
                negative_prompt="low quality, blurry, distorted",
                image=base_output.images,
                num_inference_steps=15,
                denoising_start=0.8,
                strength=0.4,
                guidance_scale=5.0
            )

        image = refined_output.images[0]
        image = sanitize_image(image)

        if image.getextrema() == (0, 0):
            raise ValueError("Generated completely black image")

        output_image_base64 = image_to_base64(image)
        return render_template("generate.html", output_image=output_image_base64, prompt=prompt, result_page=True)

    except Exception as e:
        logger.error(f"❌ Error during generation: {str(e)}")
        return "❌ Generation failed - Internal error", 500

    finally:
        try:
            del refined_output, image
            del refiner_pipe
        except:
            pass
        gc.collect()
        torch.cuda.empty_cache()

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
        return f"Error: {e}", 500

@app.route('/outputs/<filename>')
def serve_image(filename):
    return send_file(os.path.join(OUTPUT_DIR, filename), mimetype="image/png")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=4000, debug=True)
