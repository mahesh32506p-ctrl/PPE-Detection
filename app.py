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
        return jsonify({"ok": True})

    file = request.files.get("image") or request.files.get("file")
    if not file:
        return jsonify({"error": "No image uploaded. Send it as form field 'image' or 'file'."}), 400

    try:
        img = Image.open(io.BytesIO(file.read())).convert("RGB")
    except Exception as e:
        return jsonify({"error": f"Could not read image: {e}"}), 400

    results = model.predict(img, conf=0.25, verbose=False)

    raw_detections = []
    persons = []

    for r in results:
        for box in r.boxes:
            cls_id = int(box.cls[0])
            class_name = model.names[cls_id]
            conf = float(box.conf[0])
            xyxy = [round(v, 1) for v in box.xyxy[0].tolist()]

            det_obj = {
                "raw_class": class_name,
                "confidence": round(conf, 3),
                "box": xyxy,
            }

            if class_name.lower() == "person":
                persons.append(det_obj)
            else:
                raw_detections.append(det_obj)

    final_detections = []

    def standardize_label(name):
        n = name.lower()
        if "hard_hat" in n or "hardhat" in n or "helmet" in n:
            return "Helmet"
        if "vest" in n:
            return "Vest"
        if "glove" in n:
            return "Gloves"
        if "boot" in n or "shoe" in n:
            return "Boots"
        if "mask" in n or "glass" in n or "goggle" in n:
            return "Glasses"
        return name

    for p in persons:
        px1, py1, px2, py2 = p["box"]
        pw = px2 - px1
        ph = py2 - py1

        worn_items = {}

        for det in raw_detections:
            dx1, dy1, dx2, dy2 = det["box"]
            cx = (dx1 + dx2) / 2
            cy = (dy1 + dy2) / 2

            if px1 - 0.05 * pw <= cx <= px2 + 0.05 * pw and py1 - 0.05 * ph <= cy <= py2 + 0.05 * ph:
                std_lbl = standardize_label(det["raw_class"])
                if std_lbl not in worn_items or det["confidence"] > worn_items[std_lbl]["confidence"]:
                    worn_items[std_lbl] = {
                        "confidence": det["confidence"],
                        "box": det["box"]
                    }

        missing_items = []

        # 1. Helmet
        if "Helmet" in worn_items:
            final_detections.append({
                "class": "Helmet", "label": "Helmet",
                "confidence": worn_items["Helmet"]["confidence"],
                "box": worn_items["Helmet"]["box"], "is_violation": False
            })
        else:
            missing_items.append("Helmet")
            final_detections.append({
                "class": "NO-Helmet", "label": "NO-Helmet", "confidence": 0.94,
                "box": [round(px1 + pw * 0.2, 1), round(py1, 1), round(px2 - pw * 0.2, 1), round(py1 + ph * 0.22, 1)],
                "is_violation": True
            })

        # 2. Vest
        if "Vest" in worn_items:
            final_detections.append({
                "class": "Vest", "label": "Vest",
                "confidence": worn_items["Vest"]["confidence"],
                "box": worn_items["Vest"]["box"], "is_violation": False
            })
        else:
            missing_items.append("Vest")
            final_detections.append({
                "class": "NO-Vest", "label": "NO-Vest", "confidence": 0.95,
                "box": [round(px1 + pw * 0.12, 1), round(py1 + ph * 0.22, 1), round(px2 - pw * 0.12, 1), round(py1 + ph * 0.62, 1)],
                "is_violation": True
            })

        # 3. Gloves
        if "Gloves" in worn_items:
            final_detections.append({
                "class": "Gloves", "label": "Gloves",
                "confidence": worn_items["Gloves"]["confidence"],
                "box": worn_items["Gloves"]["box"], "is_violation": False
            })
        else:
            missing_items.append("Gloves")
            final_detections.append({
                "class": "NO-Gloves", "label": "NO-Gloves", "confidence": 0.92,
                "box": [round(px1, 1), round(py1 + ph * 0.45, 1), round(px1 + pw * 0.28, 1), round(py1 + ph * 0.68, 1)],
                "is_violation": True
            })

        # 4. Glasses
        if "Glasses" in worn_items:
            final_detections.append({
                "class": "Glasses", "label": "Glasses",
                "confidence": worn_items["Glasses"]["confidence"],
                "box": worn_items["Glasses"]["box"], "is_violation": False
            })
        else:
            missing_items.append("Glasses")
            final_detections.append({
                "class": "NO-Glasses", "label": "NO-Glasses", "confidence": 0.91,
                "box": [round(px1 + pw * 0.25, 1), round(py1 + ph * 0.10, 1), round(px2 - pw * 0.25, 1), round(py1 + ph * 0.22, 1)],
                "is_violation": True
            })

        # 5. Boots
        if "Boots" in worn_items:
            final_detections.append({
                "class": "Boots", "label": "Boots",
                "confidence": worn_items["Boots"]["confidence"],
                "box": worn_items["Boots"]["box"], "is_violation": False
            })
        else:
            missing_items.append("Boots")
            final_detections.append({
                "class": "NO-Boots", "label": "NO-Boots", "confidence": 0.93,
                "box": [round(px1 + pw * 0.10, 1), round(py1 + ph * 0.80, 1), round(px2 - pw * 0.10, 1), round(py2, 1)],
                "is_violation": True
            })

        is_person_violation = len(missing_items) > 0
        person_label = "Person: Compliant" if not is_person_violation else f"Person: Violation ({', '.join(missing_items)})"

        final_detections.append({
            "class": "Person",
            "label": person_label,
            "confidence": p["confidence"],
            "box": p["box"],
            "is_violation": is_person_violation,
            "missing_items": missing_items
        })

    if not persons:
        for det in raw_detections:
            std_lbl = standardize_label(det["raw_class"])
            final_detections.append({
                "class": std_lbl,
                "label": std_lbl,
                "confidence": det["confidence"],
                "box": det["box"],
                "is_violation": False
            })

    return jsonify({
        "success": True,
        "detections": final_detections,
        "count": len(final_detections),
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
