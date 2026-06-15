import numpy as np
import io
from PIL import Image
from keras.models import load_model
from keras.applications.efficientnet import preprocess_input
from transformers import pipeline

IMG_MODEL = load_model("model/grievance_model.keras")
IMG_CLASSES = ["garbage", "pothole", "waterlogging"]
print("[OK] Image model loaded")

NLP_MODEL = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")
NLP_DESCRIPTIONS = [
    "electricity problem, power cut, no current, light not working",
    "illegal construction, encroachment, unauthorized building on footpath",
    "complaint against officer, corruption, bribe demand, delayed response",
]
NLP_CATEGORIES = [
    "Power & Electricity",
    "Illegal Encroachment",
    "Administrative Complaints",
]
print("[OK] Zero-shot NLP model loaded")


def predict_image(image_bytes: bytes) -> dict:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image = image.resize((224, 224))
    arr = np.array(image)
    arr = preprocess_input(arr)
    arr = np.expand_dims(arr, axis=0)
    preds = IMG_MODEL.predict(arr)
    index = int(np.argmax(preds[0]))
    confidence = round(float(preds[0][index]) * 100, 2)
    if confidence < 70.0:
        return {"category": "Unclassified", "confidence": confidence, "low_confidence": True}
    return {"category": IMG_CLASSES[index], "confidence": confidence, "low_confidence": False}


def predict_text(text: str) -> dict:
    result = NLP_MODEL(text, NLP_DESCRIPTIONS, hypothesis_template="This complaint is about {}.")
    index = NLP_DESCRIPTIONS.index(result["labels"][0])
    confidence = round(float(result["scores"][0]) * 100, 2)
    if confidence < 70.0:
        return {"category": "Unclassified", "confidence": confidence, "low_confidence": True}
    return {"category": NLP_CATEGORIES[index], "confidence": confidence, "low_confidence": False}