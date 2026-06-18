from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import threading
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
    get_worker_by_username,
    get_complaints_for_zone,
)
from models import predict_image, predict_text
from bot import bot, notify_resolution
from utils import reverse_geocode


def _start_bot_polling():
    """Start bot polling with retry logic for network issues."""
    import time
    max_retries = 5
    for attempt in range(max_retries):
        try:
            bot.remove_webhook()
            break
        except Exception as e:
            wait = min(2 ** attempt, 30)
            print(f"[WARN] remove_webhook failed (attempt {attempt + 1}/{max_retries}): {e}")
            print(f"[WARN] Retrying in {wait}s...")
            time.sleep(wait)
    else:
        print("[WARN] Could not remove webhook after retries, attempting polling anyway")

    print("[OK] Starting Telegram bot polling...")
    bot.infinity_polling(timeout=30, long_polling_timeout=30)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start polling in a background daemon thread
    polling_thread = threading.Thread(target=_start_bot_polling, daemon=True)
    polling_thread.start()
    print("[OK] Telegram bot polling thread launched")
    yield
    # Stop polling on shutdown
    bot.stop_polling()
    print("[OK] Telegram bot polling stopped")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"status": "Grievance API running"}


@app.post("/predict/image")
async def predict_image_endpoint(file: UploadFile = File(...)):
    image_bytes = await file.read()
    result = predict_image(image_bytes)
    return result


@app.post("/predict/text")
async def predict_text_endpoint(body: dict):
    result = predict_text(body["text"])
    return result


@app.get("/complaints/all")
async def all_complaints():
    return get_all_complaints()


@app.get("/complaints/sanitation")
async def sanitation_complaints():
    return get_sanitation_complaints()


@app.get("/complaint/track/{grievance_code}")
async def track_complaint(grievance_code: str):
    complaint = get_complaint_by_code(grievance_code)
    if complaint is None:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return complaint


@app.post("/complaint/save")
async def save_complaint_endpoint(data: dict):
    inserted_id = save_complaint(data)
    return {"success": True, "id": inserted_id}


@app.patch("/complaint/status/{grievance_code}")
async def update_status_endpoint(grievance_code: str, body: dict):
    found = update_status(grievance_code, body["status"])
    if not found:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return {"success": True}


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


@app.patch("/complaint/classify")
async def classify_complaint_endpoint(body: dict):
    found = classify_complaint(body["grievance_code"], body["category"])
    if not found:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return {"success": True}


@app.get("/reverse-geocode")
async def reverse_geocode_endpoint(lat: float, lng: float):
    address = await reverse_geocode(lat, lng)
    return {"address": address}


@app.post("/worker/login")
async def worker_login(body: dict):
    worker = get_worker_by_username(body["username"])
    if not worker or worker.get("password") != body["password"]:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {
        "success": True,
        "name": worker["name"],
        "username": worker["username"],
        "zone_lat": worker["zone_lat"],
        "zone_lng": worker["zone_lng"],
        "zone_radius_km": worker["zone_radius_km"],
    }


@app.get("/complaints/zone")
async def zone_complaints(lat: float, lng: float, radius: float):
    return get_complaints_for_zone(lat, lng, radius)


@app.post("/webhook")
async def telegram_webhook(request: Request):
    import json
    from telebot import types
    body = await request.body()
    update = types.Update.de_json(json.loads(body))
    bot.process_new_updates([update])
    return {"ok": True}