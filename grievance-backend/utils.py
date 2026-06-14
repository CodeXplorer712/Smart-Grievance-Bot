import random
import string
from datetime import datetime
import httpx


def generate_grievance_code() -> str:
    date_part = datetime.now().strftime("%Y%m%d")
    random_part = "".join(random.choices(string.ascii_uppercase + string.digits, k=5))
    return f"GRV-{date_part}-{random_part}"


async def reverse_geocode(lat: float, lng: float) -> str:
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={"lat": lat, "lon": lng, "format": "json"},
                headers={"User-Agent": "SolapurGrievanceSystem/1.0"},
            )
            data = response.json()
            parts = data["display_name"].split(",")
            return ", ".join(part.strip() for part in parts[:3])
    except Exception:
        return f"{lat}, {lng}"
