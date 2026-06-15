import os
from pymongo import MongoClient
from datetime import datetime

client = MongoClient(os.environ["MONGODB_URI"])
db = client["grievance_db"]
complaints = db["complaints"]
print("[OK] MongoDB connected")


def save_complaint(data: dict) -> str:
    result = complaints.insert_one(data)
    return str(result.inserted_id)


def get_all_complaints() -> list:
    docs = complaints.find({}, {"image_base64": 0, "resolution_image": 0}).sort("timestamp", -1)
    result = []
    for doc in docs:
        doc["_id"] = str(doc["_id"])
        result.append(doc)
    return result


def get_sanitation_complaints() -> list:
    docs = complaints.find({"category": "garbage"}, {"image_base64": 0, "resolution_image": 0}).sort("timestamp", 1)
    result = []
    for doc in docs:
        doc["_id"] = str(doc["_id"])
        result.append(doc)
    return result


def get_complaint_by_code(code: str) -> dict | None:
    doc = complaints.find_one({"grievance_code": code})
    if doc:
        doc["_id"] = str(doc["_id"])
    return doc


def update_status(code: str, status: str) -> bool:
    result = complaints.update_one(
        {"grievance_code": code},
        {"$set": {"status": status, "updated_at": datetime.utcnow()}},
    )
    return result.matched_count > 0


def resolve_complaint(code: str, data: dict) -> bool:
    result = complaints.update_one(
        {"grievance_code": code},
        {
            "$set": {
                "status": "Resolved",
                "resolution_image": data.get("resolution_image"),
                "resolution_note": data.get("resolution_note"),
                "resolved_at": datetime.utcnow(),
            }
        },
    )
    return result.matched_count > 0


def classify_complaint(code: str, category: str) -> bool:
    result = complaints.update_one(
        {"grievance_code": code},
        {
            "$set": {
                "category": category,
                "low_confidence": False,
                "manually_classified": True,
                "classified_at": datetime.utcnow(),
            }
        },
    )
    return result.matched_count > 0