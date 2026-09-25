"""
SpectaAI / SafeSight backend.

Loads your trained YOLOv8 PPE-detection model (best.pt) and exposes a
single /detect endpoint. Your webpage sends a photo (a webcam frame or a
frame grabbed from an uploaded video) to this endpoint, and gets back
JSON describing what PPE items were detected.

HOW TO GET best.pt:
  In your Colab notebook, after model.train(...) finishes, the trained
  weights are saved automatically at:
      runs/detect/train/weights/best.pt
  Download that exact file from the Colab file browser (folder icon on
  the left sidebar -> runs/detect/train/weights/ -> right-click best.pt
  -> Download) and place it in this same folder, next to app.py.

RUN LOCALLY (to test before deploying):
  pip install -r requirements.txt
  python app.py
  Then it runs at http://localhost:5000

DEPLOY ON RENDER:
  1. Push this whole folder (app.py, requirements.txt, best.pt, code.html,
     index.html) to a new GitHub repo.
  2. On render.com: New -> Web Service -> connect your GitHub repo.
  3. Build Command:  pip install -r requirements.txt
     Start Command:  gunicorn app:app
  4. Deploy. Render gives you a URL like https://your-app.onrender.com
  5. Put that URL into BACKEND_URL near the top of the <script> in
     code.html (see the comment there).
"""

from flask import Flask, request, jsonify
from ultralytics import YOLO
from PIL import Image
import io
import os

app = Flask(__name__)

MODEL_PATH = os.environ.get("MODEL_PATH", "best.pt")
model = YOLO(MODEL_PATH)

# Class names your model was trained to detect, e.g.
# {0: 'Hardhat', 1: 'Mask', 2: 'NO-Hardhat', 3: 'NO-Mask', ...}
# This comes straight from your trained model, so no need to hardcode it.
print("Loaded model classes:", model.names)


@app.after_request
def add_cors_headers(response):
    # Allows your webpage (served from a different origin) to call this API.
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.route("/", methods=["GET"])
def home():
    return jsonify({"status": "ok", "message": "SpectaAI PPE detection API is running."})


@app.route("/detect", methods=["POST", "OPTIONS"])
def detect():
    if request.method == "OPTIONS":
        # Browser preflight request — just acknowledge it.
        return jsonify({"ok": True})

    if "image" not in request.files:
        return jsonify({"error": "No image uploaded. Send it as form field 'image'."}), 400

    file = request.files["image"]

    try:
        img = Image.open(io.BytesIO(file.read())).convert("RGB")
    except Exception as e:
        return jsonify({"error": f"Could not read image: {e}"}), 400

    results = model.predict(img, conf=0.4, verbose=False)

    detections = []
    for r in results:
        for box in r.boxes:
            cls_id = int(box.cls[0])
            label = model.names[cls_id]
            conf = float(box.conf[0])
            xyxy = [round(v, 1) for v in box.xyxy[0].tolist()]
            detections.append({
                "label": label,
                "confidence": round(conf, 3),
                "box": xyxy,  # [x1, y1, x2, y2] in pixel coords, if you want to draw it
            })

    return jsonify({
        "detections": detections,
        "count": len(detections),
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
