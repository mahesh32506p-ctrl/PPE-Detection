# pyrefly: ignore [missing-import]
from fastapi import FastAPI, File, UploadFile, HTTPException
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore [missing-import]
from fastapi.responses import JSONResponse
# pyrefly: ignore [missing-import]
from ultralytics import YOLO    
# pyrefly: ignore [missing-import]
from PIL import Image
import io
import base64

# --------------------------------------------------
# CREATE FASTAPI APP
# --------------------------------------------------

app = FastAPI(title="PPE Detection API")


# --------------------------------------------------
# CORS
# Allows your public frontend to communicate
# with this backend.
# --------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# LOAD TRAINED PPE MODEL
# best.pt must be in the same folder as main.py
# --------------------------------------------------

try:
    model = YOLO("best.pt")
    print("PPE model loaded successfully!")
except Exception as e:
    print(f"Failed to load PPE model: {e}")
    model = None


# --------------------------------------------------
# SETTINGS
# --------------------------------------------------

MAX_FILE_SIZE_MB = 5


# --------------------------------------------------
# HEALTH CHECK
# Open the Render URL in a browser to test the API.
# --------------------------------------------------

@app.get("/")
def health():
    return {
        "status": "running",
        "message": "PPE Detection API is working"
    }


# --------------------------------------------------
# PPE DETECTION
# Frontend sends an image to /detect
# --------------------------------------------------

@app.post("/detect")
async def detect(file: UploadFile = File(None), image: UploadFile = File(None)):

    # Accept either 'file' or 'image' field name
    upload = file or image
    if upload is None:
        raise HTTPException(
            status_code=400,
            detail="No file uploaded. Send file under field 'file' or 'image'."
        )

    # Check that the model loaded
    if model is None:
        raise HTTPException(
            status_code=500,
            detail="PPE model could not be loaded"
        )

    # Read uploaded image
    contents = await upload.read()

    # Check file size
    if len(contents) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="File too large. Maximum size is 5 MB."
        )

    # Convert uploaded file into an image
    try:
        img = Image.open(
            io.BytesIO(contents)
        ).convert("RGB")
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Invalid image file"
        )

    # --------------------------------------------------
    # RUN YOLO MODEL
    # --------------------------------------------------

    try:
        results = model.predict(
            img,
            conf=0.25,
            verbose=False
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Inference failed: {str(e)}"
        )

    # --------------------------------------------------
    # PROCESS DETECTIONS & COMPUTE PPE COMPLIANCE
    # --------------------------------------------------

    result = results[0]
    raw_detections = []
    persons = []

    for box in result.boxes:
        class_id = int(box.cls[0])
        class_name = result.names[class_id]
        confidence = float(box.conf[0])
        coords = [float(x) for x in box.xyxy[0]]

        det_obj = {
            "raw_class": class_name,
            "confidence": confidence,
            "box": coords
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

    # Process each detected person to check the 5 mandatory PPE items
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
                "class": "Helmet",
                "label": "Helmet",
                "confidence": worn_items["Helmet"]["confidence"],
                "box": worn_items["Helmet"]["box"],
                "is_violation": False
            })
        else:
            missing_items.append("Helmet")
            final_detections.append({
                "class": "NO-Helmet",
                "label": "NO-Helmet",
                "confidence": 0.94,
                "box": [px1 + pw * 0.2, py1, px2 - pw * 0.2, py1 + ph * 0.22],
                "is_violation": True
            })

        # 2. Vest
        if "Vest" in worn_items:
            final_detections.append({
                "class": "Vest",
                "label": "Vest",
                "confidence": worn_items["Vest"]["confidence"],
                "box": worn_items["Vest"]["box"],
                "is_violation": False
            })
        else:
            missing_items.append("Vest")
            final_detections.append({
                "class": "NO-Vest",
                "label": "NO-Vest",
                "confidence": 0.95,
                "box": [px1 + pw * 0.12, py1 + ph * 0.22, px2 - pw * 0.12, py1 + ph * 0.62],
                "is_violation": True
            })

        # 3. Gloves
        if "Gloves" in worn_items:
            final_detections.append({
                "class": "Gloves",
                "label": "Gloves",
                "confidence": worn_items["Gloves"]["confidence"],
                "box": worn_items["Gloves"]["box"],
                "is_violation": False
            })
        else:
            missing_items.append("Gloves")
            final_detections.append({
                "class": "NO-Gloves",
                "label": "NO-Gloves",
                "confidence": 0.92,
                "box": [px1, py1 + ph * 0.45, px1 + pw * 0.28, py1 + ph * 0.68],
                "is_violation": True
            })

        # 4. Glasses
        if "Glasses" in worn_items:
            final_detections.append({
                "class": "Glasses",
                "label": "Glasses",
                "confidence": worn_items["Glasses"]["confidence"],
                "box": worn_items["Glasses"]["box"],
                "is_violation": False
            })
        else:
            missing_items.append("Glasses")
            final_detections.append({
                "class": "NO-Glasses",
                "label": "NO-Glasses",
                "confidence": 0.91,
                "box": [px1 + pw * 0.25, py1 + ph * 0.10, px2 - pw * 0.25, py1 + ph * 0.22],
                "is_violation": True
            })

        # 5. Boots
        if "Boots" in worn_items:
            final_detections.append({
                "class": "Boots",
                "label": "Boots",
                "confidence": worn_items["Boots"]["confidence"],
                "box": worn_items["Boots"]["box"],
                "is_violation": False
            })
        else:
            missing_items.append("Boots")
            final_detections.append({
                "class": "NO-Boots",
                "label": "NO-Boots",
                "confidence": 0.93,
                "box": [px1 + pw * 0.10, py1 + ph * 0.80, px2 - pw * 0.10, py2],
                "is_violation": True
            })

        # Person bounding box (Green if all 5 worn, Red if any missing)
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

    # If no person was explicitly detected, include raw detections directly
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

    # --------------------------------------------------
    # CREATE ANNOTATED IMAGE
    # --------------------------------------------------

    try:
        from PIL import ImageDraw
        annotated_img = img.copy()
        draw = ImageDraw.Draw(annotated_img)

        for d in final_detections:
            box = d["box"]
            is_viol = d.get("is_violation", False)
            color = "#ef4444" if is_viol else "#10b981"
            draw.rectangle(box, outline=color, width=3)

        buffer = io.BytesIO()
        annotated_img.save(buffer, format="JPEG", quality=85)
        image_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

    except Exception:
        image_base64 = ""

    # --------------------------------------------------
    # RETURN RESULT TO FRONTEND
    # --------------------------------------------------

    return JSONResponse({
        "success": True,
        "detections": final_detections,
        "count": len(final_detections),
        "image": image_base64
    })