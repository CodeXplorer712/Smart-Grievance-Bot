import os
import math
from pymongo import MongoClient
from datetime import datetime
client = MongoClient(os.environ["MONGODB_URI"])
db = client["grievance_db"]
complaints = db["complaints"]
workers = db["workers"]
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
        doc["assigned_worker"] = get_assigned_worker(doc)
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
                "resolved_by": data.get("resolved_by"),
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
def get_worker_by_username(username: str) -> dict | None:
    doc = workers.find_one({"username": username})
    if doc:
        doc["_id"] = str(doc["_id"])
    return doc
def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371
    dLat = math.radians(lat2 - lat1)
    dLng = math.radians(lng2 - lng1)
    a = (
        math.sin(dLat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c
def get_complaints_for_zone(zone_lat: float, zone_lng: float, radius_km: float) -> list:
    all_workers = list(workers.find())
    all_complaints = get_sanitation_complaints()
    filtered = []
    for complaint in all_complaints:
        lat = complaint.get("lat")
        lng = complaint.get("lng")
        if lat is None or lng is None:
            continue
        dist_to_this_zone = haversine_distance(zone_lat, zone_lng, lat, lng)
        if dist_to_this_zone > radius_km:
            continue
        is_nearest = True
        for worker in all_workers:
            other_lat = worker.get("zone_lat")
            other_lng = worker.get("zone_lng")
            if other_lat == zone_lat and other_lng == zone_lng:
                continue
            dist_to_other = haversine_distance(other_lat, other_lng, lat, lng)
            if dist_to_other < dist_to_this_zone:
                is_nearest = False
                break
        if is_nearest:
            filtered.append(complaint)
    return filtered
def get_assigned_worker(complaint: dict) -> str:
    lat = complaint.get("lat")
    lng = complaint.get("lng")
    if lat is None or lng is None:
        return "Not available"
    all_workers = list(workers.find())
    if not all_workers:
        return "Not available"
    nearest = None
    nearest_dist = float('inf')
    for worker in all_workers:
        dist = haversine_distance(
            worker["zone_lat"], worker["zone_lng"],
            lat, lng)
        if dist < nearest_dist:
            nearest_dist = dist
            nearest = worker["name"]
    return nearest or "Not available"
