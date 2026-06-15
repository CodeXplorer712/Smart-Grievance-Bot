from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import threading
import os
from dotenv import load_dotenv

load_dotenv()

from database import (
    save_complaint,
    get_all_complaints,
    get_sanitation_complaints,
    get_complaint_by_code,
    update_status,
    resolve_complaint,
    classify_complaint,
)
from models import predict_image, predict_text
from bot import bot, notify_resolution
from utils import reverse_geocode


@asynccontextmanager
async def lifespan(app: FastAPI):
    thread = threading.Thread(
        target=lambda: bot.infinity_polling(
            none_stop=True, interval=0, timeout=20
        ),
        daemon=True,
    )
    thread.start()
    print("[OK] Telegram bot polling started")
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# 1. GET /
@app.get("/")
async def root():
    return {"status": "Grievance API running"}


# 2. POST /predict/image
@app.post("/predict/image")
async def predict_image_endpoint(file: UploadFile = File(...)):
    image_bytes = await file.read()
    result = predict_image(image_bytes)
    return result


# 3. POST /predict/text
@app.post("/predict/text")
async def predict_text_endpoint(body: dict):
    result = predict_text(body["text"])
    return result


# 4. GET /complaints/all
@app.get("/complaints/all")
async def all_complaints():
    return get_all_complaints()


# 5. GET /complaints/sanitation
@app.get("/complaints/sanitation")
async def sanitation_complaints():
    return get_sanitation_complaints()


# 6. GET /complaint/track/{grievance_code}
@app.get("/complaint/track/{grievance_code}")
async def track_complaint(grievance_code: str):
    complaint = get_complaint_by_code(grievance_code)
    if complaint is None:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return complaint


# 7. POST /complaint/save
@app.post("/complaint/save")
async def save_complaint_endpoint(data: dict):
    inserted_id = save_complaint(data)
    return {"success": True, "id": inserted_id}


# 8. PATCH /complaint/status/{grievance_code}
@app.patch("/complaint/status/{grievance_code}")
async def update_status_endpoint(grievance_code: str, body: dict):
    found = update_status(grievance_code, body["status"])
    if not found:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return {"success": True}


# 9. PATCH /complaint/resolve/{grievance_code}
@app.patch("/complaint/resolve/{grievance_code}")
async def resolve_complaint_endpoint(grievance_code: str, data: dict):
    found = resolve_complaint(grievance_code, data)
    if not found:
        raise HTTPException(status_code=404, detail="Complaint not found")
    notify_resolution(
        grievance_code,
        data.get("resolution_note"),
        data.get("resolution_image"),
    )
    return {"success": True}


# 10. PATCH /complaint/classify
@app.patch("/complaint/classify")
async def classify_complaint_endpoint(body: dict):
    found = classify_complaint(body["grievance_code"], body["category"])
    if not found:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return {"success": True}


# 11. GET /reverse-geocode
@app.get("/reverse-geocode")
async def reverse_geocode_endpoint(lat: float, lng: float):
    address = await reverse_geocode(lat, lng)
    return {"address": address}