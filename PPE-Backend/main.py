from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from ultralytics import YOLO
from PIL import Image
import io
import base64
import os

# --------------------------------------------------
# CREATE FASTAPI APP
# --------------------------------------------------

app = FastAPI(title="SafeSight PPE Detection API", version="4.2")


# --------------------------------------------------
# CORS CONFIGURATION
# Allows public frontend connections
# --------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# LOCATE AND LOAD TRAINED PPE MODEL (best.pt)
# --------------------------------------------------

MODEL_PATHS = [
    os.path.join(os.path.dirname(__file__), "best.pt"),
    os.path.join(os.path.dirname(__file__), "..", "best.pt"),
    "best.pt"
]

model = None
for mpath in MODEL_PATHS:
    if os.path.exists(mpath):
        try:
            model = YOLO(mpath)
            print(f"PPE model loaded successfully from {mpath}!")
            print(f"Model classes: {model.names}")
            break
        except Exception as e:
            print(f"Attempt to load model from {mpath} failed: {e}")

if model is None:
    print("Warning: Could not find or load best.pt. API will return 503 until model is ready.")


# --------------------------------------------------
# SETTINGS
# --------------------------------------------------

MAX_FILE_SIZE_MB = 10


# --------------------------------------------------
# FRONTEND STATIC ASSETS MOUNTING
# --------------------------------------------------

# Resolve frontend directory (checks root workspace first, then current dir)
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if not os.path.exists(os.path.join(FRONTEND_DIR, "index.html")):
    FRONTEND_DIR = os.path.abspath(os.path.dirname(__file__))

css_path = os.path.join(FRONTEND_DIR, "css")
if os.path.exists(css_path):
    app.mount("/css", StaticFiles(directory=css_path), name="css")

js_path = os.path.join(FRONTEND_DIR, "js")
if os.path.exists(js_path):
    app.mount("/js", StaticFiles(directory=js_path), name="js")


# --------------------------------------------------
# HEALTH & HOMEPAGE ROUTES
# --------------------------------------------------

@app.get("/")
def home(request: Request):
    # If a browser requests HTML, serve the frontend application
    accept = request.headers.get("accept", "")
    index_file = os.path.join(FRONTEND_DIR, "index.html")
    if "text/html" in accept and os.path.exists(index_file):
        return FileResponse(index_file)
    
    return {
        "status": "running",
        "message": "SafeSight PPE Detection API is active",
        "model_loaded": model is not None,
        "classes": list(model.names.values()) if model else []
    }


@app.get("/health")
@app.get("/api/health")
def health():
    return {
        "status": "running",
        "model_loaded": model is not None,
        "classes": list(model.names.values()) if model else []
    }


@app.get("/index.html")
def get_index():
    index_file = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail="index.html not found")


@app.get("/code.html")
def get_code():
    code_file = os.path.join(FRONTEND_DIR, "code.html")
    if os.path.exists(code_file):
        return FileResponse(code_file)
    raise HTTPException(status_code=404, detail="code.html not found")


@app.get("/kinetic-3d.html")
def get_kinetic():
    kinetic_file = os.path.join(FRONTEND_DIR, "kinetic-3d.html")
    if os.path.exists(kinetic_file):
        return FileResponse(kinetic_file)
    raise HTTPException(status_code=404, detail="kinetic-3d.html not found")


# --------------------------------------------------
# PPE DETECTION ENDPOINT (/detect)
# Supports both 'file' and 'image' multipart form fields
# --------------------------------------------------

async def detect(file: UploadFile = File(None), image: UploadFile = File(None)):

    upload = file if file is not None else image
    if upload is None:
        raise HTTPException(
            status_code=400,
            detail="No file or image uploaded. Send file under field 'file' or 'image'."
        )

    # Check model readiness
    if model is None:
        raise HTTPException(
            status_code=503,
            detail="PPE model weights (best.pt) not loaded."
        )

    # Read uploaded image bytes
    contents = await upload.read()

    # Check file size
    if len(contents) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB} MB."
        )

    # Convert uploaded file into PIL RGB image
    try:
        pil_image = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image format: {str(e)}"
        )

    # --------------------------------------------------
    # RUN YOLO MODEL PREDICTION
    # --------------------------------------------------

    try:
        results = model.predict(
            pil_image,
            conf=0.25,
            verbose=False
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Neural inference error: {str(e)}"
        )

    # --------------------------------------------------
    # PROCESS DETECTIONS
    # --------------------------------------------------

    result = results[0]
    detections = []

    for box in result.boxes:
        class_id = int(box.cls[0])
        confidence = round(float(box.conf[0]), 3)
        coordinates = [round(float(x), 1) for x in box.xyxy[0]]
        class_name = result.names[class_id]

        detections.append({
            "class": class_name,
            "label": class_name,
            "confidence": confidence,
            "box": coordinates
        })

    # --------------------------------------------------
    # CREATE ANNOTATED IMAGE PREVIEW (BASE64)
    # --------------------------------------------------

    image_base64 = None
    try:
        annotated = result.plot()
        annotated_img = Image.fromarray(annotated[..., ::-1])
        buffer = io.BytesIO()
        annotated_img.save(buffer, format="JPEG", quality=85)
        image_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    except Exception as e:
        print(f"Warning: could not create annotated preview: {e}")

    # --------------------------------------------------
    # RETURN RESULT TO FRONTEND
    # --------------------------------------------------

    return JSONResponse({
        "success": True,
        "status": "ok",
        "detections": detections,
        "count": len(detections),
        "image": image_base64
    })


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)