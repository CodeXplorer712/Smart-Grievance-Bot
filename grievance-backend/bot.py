import os
import telebot
from telebot import types
from datetime import datetime
import requests
import base64
import io
from models import predict_image, predict_text
from database import save_complaint, get_complaint_by_code
from utils import generate_grievance_code


def reverse_geocode_sync(lat, lng):
    try:
        response = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": lat, "lon": lng, "format": "json"},
            headers={"User-Agent": "SolapurGrievanceSystem/1.0"},
            timeout=5,
        )
        data = response.json()
        parts = data["display_name"].split(",")
        return ", ".join(part.strip() for part in parts[:3])
    except Exception:
        return f"{lat}, {lng}"

bot = telebot.TeleBot(os.environ["TELEGRAM_TOKEN"], threaded=False)
print("[OK] Telegram bot initialized")

USER_STATES = {}
USER_DATA = {}


# HANDLER 1: /start command
@bot.message_handler(commands=["start"])
def handle_start(message):
    chat_id = message.chat.id
    USER_STATES.pop(chat_id, None)
    USER_DATA.pop(chat_id, None)

    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add(types.KeyboardButton("Lodge Complaint"), types.KeyboardButton("Track Complaint"))

    bot.send_message(
        chat_id,
        "Welcome to Solapur Municipal Corporation\nGrievance Management System.\n\nPlease choose an option:",
        reply_markup=markup,
    )


# HANDLER 2: "Lodge Complaint" button
@bot.message_handler(func=lambda m: m.text == "Lodge Complaint")
def handle_lodge_complaint(message):
    chat_id = message.chat.id
    USER_STATES[chat_id] = "waiting_complaint"

    markup = types.ReplyKeyboardRemove()
    bot.send_message(
        chat_id,
        "Please send a photo of the issue\nor describe it in text.",
        reply_markup=markup,
    )


# HANDLER 3: Photo handler
@bot.message_handler(content_types=["photo"])
def handle_photo(message):
    chat_id = message.chat.id
    if USER_STATES.get(chat_id) != "waiting_complaint":
        return

    file_info = bot.get_file(message.photo[-1].file_id)
    downloaded = bot.download_file(file_info.file_path)
    image_bytes = bytes(downloaded)

    result = predict_image(image_bytes)
    USER_DATA[chat_id] = result
    USER_DATA[chat_id]["type"] = "image"
    USER_DATA[chat_id]["image_base64"] = base64.b64encode(image_bytes).decode("utf-8")
    USER_STATES[chat_id] = "waiting_location"

    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add(types.KeyboardButton("Share Location", request_location=True))

    if result["low_confidence"]:
        bot.send_message(
            chat_id,
            "Could not classify with confidence.\nYour complaint will be reviewed by admin.\nPlease share your location.",
            reply_markup=markup,
        )
    else:
        bot.send_message(
            chat_id,
            f"Detected: {result['category']}\nPlease share your location.",
            reply_markup=markup,
        )


# HANDLER 4: Text message handler
@bot.message_handler(content_types=["text"])
def handle_text(message):
    chat_id = message.chat.id
    state = USER_STATES.get(chat_id)

    if state == "waiting_complaint":
        result = predict_text(message.text)
        USER_DATA[chat_id] = result
        USER_DATA[chat_id]["type"] = "text"
        USER_STATES[chat_id] = "waiting_location"

        markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
        markup.add(types.KeyboardButton("Share Location", request_location=True))

        if result["low_confidence"]:
            bot.send_message(
                chat_id,
                "Could not classify with confidence.\nYour complaint will be reviewed by admin.\nPlease share your location.",
                reply_markup=markup,
            )
        else:
            bot.send_message(
                chat_id,
                f"Detected: {result['category']}\nPlease share your location.",
                reply_markup=markup,
            )

    elif state == "waiting_grievance_code":
        complaint = get_complaint_by_code(message.text.strip())
        USER_STATES.pop(chat_id, None)

        if not complaint:
            bot.send_message(
                chat_id,
                "No complaint found with that code.\nPlease check and try again.",
            )
            return

        status = complaint.get("status", "Pending")
        status_symbols = {
            "Pending": "🕐 Pending",
            "In Progress": "🔄 In Progress",
            "Resolved": "✅ Resolved",
        }
        status_display = status_symbols.get(status, status)

        timestamp = complaint.get("timestamp")
        timestamp_str = timestamp.strftime("%d %b %Y") if isinstance(timestamp, datetime) else str(timestamp)

        details = (
            f"📋 Complaint Found\n\n"
            f"Code     : {complaint.get('grievance_code')}\n"
            f"Category : {complaint.get('category')}\n"
            f"Location : {complaint.get('location')}\n"
            f"Status   : {status_display}\n"
            f"Submitted: {timestamp_str}"
        )
        bot.send_message(chat_id, details)

        if status == "Resolved":
            resolved_at = complaint.get("resolved_at")
            resolved_str = resolved_at.strftime("%d %b %Y") if isinstance(resolved_at, datetime) else str(resolved_at)
            resolution_note = complaint.get("resolution_note", "")
            bot.send_message(
                chat_id,
                f"Resolved on: {resolved_str}\nNote: {resolution_note}",
            )
            resolution_image = complaint.get("resolution_image")
            if resolution_image:
                img_bytes = base64.b64decode(resolution_image)
                bot.send_photo(chat_id, io.BytesIO(img_bytes))

    elif message.text == "Confirm & Submit":
        handle_confirm(message)

    elif message.text == "Cancel":
        handle_cancel(message)

    elif message.text == "Track Complaint":
        handle_track_complaint(message)

    elif message.text == "Lodge Complaint":
        handle_lodge_complaint(message)


# HANDLER 5: Location handler
@bot.message_handler(content_types=["location"])
def handle_location(message):
    chat_id = message.chat.id
    if USER_STATES.get(chat_id) != "waiting_location":
        return

    lat = message.location.latitude
    lng = message.location.longitude
    address = reverse_geocode_sync(lat, lng)

    USER_DATA[chat_id]["location"] = address
    USER_DATA[chat_id]["lat"] = lat
    USER_DATA[chat_id]["lng"] = lng
    USER_STATES[chat_id] = "waiting_confirmation"

    category = USER_DATA[chat_id].get("category", "Unclassified")
    now = datetime.now().strftime("%d %b %Y %H:%M")

    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add(types.KeyboardButton("Confirm & Submit"), types.KeyboardButton("Cancel"))

    bot.send_message(
        chat_id,
        f"📝 Complaint Summary\n\n"
        f"Category : {category}\n"
        f"Location : {address}\n"
        f"Date     : {now}\n\n"
        f"Please confirm or cancel.",
        reply_markup=markup,
    )


# HANDLER 6: "Confirm & Submit" button
def handle_confirm(message):
    chat_id = message.chat.id
    if USER_STATES.get(chat_id) != "waiting_confirmation":
        return

    code = generate_grievance_code()
    data = USER_DATA.get(chat_id, {})

    document = {
        "grievance_code": code,
        "type": data.get("type"),
        "category": data.get("category"),
        "confidence": data.get("confidence"),
        "low_confidence": data.get("low_confidence"),
        "location": data.get("location"),
        "lat": data.get("lat"),
        "lng": data.get("lng"),
        "status": "Pending",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "telegram_chat_id": chat_id,
        "image_base64": data.get("image_base64", None),
    }

    save_complaint(document)
    USER_STATES.pop(chat_id, None)
    USER_DATA.pop(chat_id, None)

    markup = types.ReplyKeyboardRemove()
    bot.send_message(
        chat_id,
        f"✅ Complaint Registered Successfully!\n\n"
        f"Grievance Code: {code}\n\n"
        f"Save this code to track your complaint.\n"
        f"Type /start to go back to main menu.",
        reply_markup=markup,
    )


# HANDLER 7: "Cancel" button
def handle_cancel(message):
    chat_id = message.chat.id
    USER_STATES.pop(chat_id, None)
    USER_DATA.pop(chat_id, None)

    markup = types.ReplyKeyboardRemove()
    bot.send_message(
        chat_id,
        "Complaint cancelled.\nType /start to begin again.",
        reply_markup=markup,
    )


# HANDLER 8: "Track Complaint" button
def handle_track_complaint(message):
    chat_id = message.chat.id
    USER_STATES[chat_id] = "waiting_grievance_code"

    markup = types.ReplyKeyboardRemove()
    bot.send_message(
        chat_id,
        "Please enter your Grievance Code:",
        reply_markup=markup,
    )


# RESOLUTION NOTIFICATION FUNCTION
def notify_resolution(grievance_code, resolution_note, resolution_image):
    complaint = get_complaint_by_code(grievance_code)
    if complaint and complaint.get("telegram_chat_id"):
        chat_id = complaint["telegram_chat_id"]
        bot.send_message(
            chat_id,
            f"✅ Your complaint has been resolved.\n\n"
            f"Code    : {grievance_code}\n"
            f"Note    : {resolution_note}\n\n"
            f"Thank you for using Solapur\nGrievance Management System.",
        )
        if resolution_image:
            img_bytes = base64.b64decode(resolution_image)
            bot.send_photo(chat_id, io.BytesIO(img_bytes))