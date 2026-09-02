"""
Bautagebuch Telegram Bot - Riedel Bau GmbH
===========================================
Läuft auf Railway.app — kostenlos, 24/7, kein PC nötig.

Umgebungsvariablen in Railway setzen:
  BOT_TOKEN   = dein Telegram Bot Token
  SUPABASE_URL = https://dlypbcdoxlfyyavmrhlr.supabase.co
  SUPABASE_KEY = dein Supabase publishable key
"""

import os, json, logging
from datetime import datetime, time as dtime
from pathlib import Path
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, MessageHandler, CommandHandler, filters, ContextTypes
from supabase import create_client

# ── Konfiguration aus Umgebungsvariablen ──────────────────────────
BOT_TOKEN     = os.environ.get("BOT_TOKEN", "")
SUPABASE_URL  = os.environ.get("SUPABASE_URL", "https://dlypbcdoxlfyyavmrhlr.supabase.co")
SUPABASE_KEY  = os.environ.get("SUPABASE_KEY", "")
APP_URL       = os.environ.get("APP_URL", "https://simonriedelbau.github.io/bautagebuch/")
TAGESENDE_H   = int(os.environ.get("TAGESENDE_H", "16"))
TAGESENDE_M   = int(os.environ.get("TAGESENDE_M", "30"))

BESTAETIGUNG = ["bestätigt","bestaetigt","ok","confirmed","passt","✅","👍"]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger(__name__)

# ── Supabase Client ───────────────────────────────────────────────
def get_supabase():
    return create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Projekt aus Supabase laden oder anlegen ───────────────────────
def get_or_create_projekt(chat_id: str, chat_name: str):
    sb = get_supabase()
    # Suche nach Projekt mit dieser Chat-ID
    result = sb.table("projekte").select("*").eq("telegram_chat_id", chat_id).execute()
    if result.data:
        return result.data[0]
    # Suche nach Projekt mit gleichem Namen
    result2 = sb.table("projekte").select("*").ilike("name", chat_name).execute()
    if result2.data:
        # Chat-ID verknüpfen
        sb.table("projekte").update({"telegram_chat_id": chat_id}).eq("id", result2.data[0]["id"]).execute()
        return result2.data[0]
    # Neues Projekt anlegen
    new_p = sb.table("projekte").insert({
        "name": chat_name,
        "telegram_chat_id": chat_id,
        "status": "aktiv"
    }).execute()
    return new_p.data[0] if new_p.data else {"name": chat_name, "id": None}

def save_nachricht(projekt_id: str, chat_id: str, absender: str, text: str):
    if not projekt_id:
        return
    sb = get_supabase()
    sb.table("telegram_nachrichten").insert({
        "projekt_id": projekt_id,
        "chat_id": chat_id,
        "absender": absender,
        "text": text,
        "datum": datetime.now().date().isoformat(),
        "verarbeitet": False
    }).execute()

def get_heutige_nachrichten(projekt_id: str):
    sb = get_supabase()
    heute = datetime.now().date().isoformat()
    result = sb.table("telegram_nachrichten")\
        .select("*")\
        .eq("projekt_id", projekt_id)\
        .eq("datum", heute)\
        .order("zeitpunkt")\
        .execute()
    return result.data or []

def get_naechste_blatt_nr(projekt_id: str) -> int:
    sb = get_supabase()
    result = sb.table("berichte")\
        .select("blatt_nr")\
        .eq("projekt_id", projekt_id)\
        .order("blatt_nr", desc=True)\
        .limit(1)\
        .execute()
    if result.data:
        return result.data[0]["blatt_nr"] + 1
    return 1

def speichere_bericht(projekt_id: str, nachrichten: list, blatt_nr: int):
    sb = get_supabase()
    arbeiten_text = "\n".join([
        f"[{n.get('zeitpunkt','')[:16].replace('T',' ')}] {n['absender']}: {n['text']}"
        for n in nachrichten
    ])
    heute = datetime.now().date().isoformat()
    result = sb.table("berichte").insert({
        "projekt_id": projekt_id,
        "blatt_nr": blatt_nr,
        "datum": heute,
        "ausgefuehrte_arbeiten": arbeiten_text,
        "status": "bestaetigt",
        "bestaetigt_am": datetime.now().isoformat()
    }).execute()
    # Nachrichten als verarbeitet markieren
    sb.table("telegram_nachrichten")\
        .update({"verarbeitet": True})\
        .eq("projekt_id", projekt_id)\
        .eq("datum", heute)\
        .execute()
    return result.data[0] if result.data else None

# ── App Button ────────────────────────────────────────────────────
def app_button(text="App öffnen"):
    return InlineKeyboardMarkup([[InlineKeyboardButton(text, url=APP_URL)]])

# ── Handlers ──────────────────────────────────────────────────────
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id   = str(update.effective_chat.id)
    chat_name = update.effective_chat.title or update.effective_chat.first_name or "Projekt"
    try:
        projekt = get_or_create_projekt(chat_id, chat_name)
        await update.message.reply_text(
            f"Bautagebuch Bot aktiv!\n"
            f"Projekt: {projekt['name']}\n\n"
            f"Schreibt einfach was ihr gemacht habt.\n"
            f"Um {TAGESENDE_H}:{TAGESENDE_M:02d} Uhr kommt die Tagesübersicht.\n"
            f"Bauleiter bestätigt mit: Bestätigt\n\n"
            f"/status – heutige Einträge\n"
            f"/uebersicht – Zusammenfassung jetzt\n"
            f"/app – App öffnen",
            reply_markup=app_button("Bautagebuch App öffnen")
        )
    except Exception as e:
        log.error(f"Start Fehler: {e}")
        await update.message.reply_text(f"Fehler beim Starten: {e}")

async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = str(update.effective_chat.id)
    chat_name = update.effective_chat.title or "Projekt"
    try:
        projekt = get_or_create_projekt(chat_id, chat_name)
        nachrichten = get_heutige_nachrichten(projekt["id"])
        if not nachrichten:
            await update.message.reply_text("Heute noch keine Einträge.", reply_markup=app_button())
            return
        letzte = nachrichten[-3:]
        text = f"Heute {len(nachrichten)} Einträge für {projekt['name']}:\n"
        for n in letzte:
            zeit = n.get("zeitpunkt","")[:16].replace("T"," ")
            text += f"\n[{zeit}] {n['absender']}: {n['text'][:60]}"
        if len(nachrichten) > 3:
            text += f"\n... und {len(nachrichten)-3} weitere"
        await update.message.reply_text(text, reply_markup=app_button())
    except Exception as e:
        await update.message.reply_text(f"Fehler: {e}")

async def cmd_app(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = str(update.effective_chat.id)
    chat_name = update.effective_chat.title or "Projekt"
    try:
        projekt = get_or_create_projekt(chat_id, chat_name)
        await update.message.reply_text(
            f"Bautagebuch App für: {projekt['name']}\n"
            f"Vollständiges Formular, Wetter, Archiv:",
            reply_markup=app_button("App öffnen")
        )
    except Exception as e:
        await update.message.reply_text(f"Fehler: {e}")

async def cmd_uebersicht(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = str(update.effective_chat.id)
    chat_name = update.effective_chat.title or "Projekt"
    await sende_tagesuebersicht(chat_id, chat_name, context)

async def nachricht_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    msg = update.message
    if not msg or not msg.text:
        return
    chat_id   = str(msg.chat_id)
    chat_name = msg.chat.title or msg.chat.first_name or "Projekt"
    absender  = msg.from_user.first_name or "Unbekannt"
    text      = msg.text.strip()

    try:
        projekt = get_or_create_projekt(chat_id, chat_name)

        # Bestätigung prüfen
        if any(b in text.lower() for b in BESTAETIGUNG):
            nachrichten = get_heutige_nachrichten(projekt["id"])
            if not nachrichten:
                await msg.reply_text("Heute noch keine Einträge zum Bestätigen.")
                return
            blatt_nr = get_naechste_blatt_nr(projekt["id"])
            await msg.reply_text("Bestätigt! Speichere Bericht...")
            bericht = speichere_bericht(projekt["id"], nachrichten, blatt_nr)
            await msg.reply_text(
                f"Bericht Blatt {blatt_nr} gespeichert!\n"
                f"Projekt: {projekt['name']}\n"
                f"Einträge: {len(nachrichten)}\n\n"
                f"Für PDF-Export und vollständiges Formular:",
                reply_markup=app_button("PDF in App erstellen")
            )
            return

        # Normale Nachricht speichern
        save_nachricht(projekt["id"], chat_id, absender, text)
        log.info(f"[{projekt['name']}] {absender}: {text[:60]}")

    except Exception as e:
        log.error(f"Nachricht Fehler: {e}", exc_info=True)

async def sende_tagesuebersicht(chat_id: str, chat_name: str, context):
    try:
        projekt = get_or_create_projekt(chat_id, chat_name)
        nachrichten = get_heutige_nachrichten(projekt["id"])
        heute = datetime.now().strftime("%d.%m.%Y")

        if not nachrichten:
            await context.bot.send_message(
                chat_id=int(chat_id),
                text=f"Tagesabschluss {projekt['name']} – {heute}\nKeine Einträge heute.",
                reply_markup=app_button()
            )
            return

        eintraege_text = "\n".join([
            f"[{n.get('zeitpunkt','')[:16].replace('T',' ')}] {n['absender']}: {n['text']}"
            for n in nachrichten
        ])
        text = (
            f"TAGESABSCHLUSS – {projekt['name']}\n"
            f"{heute} · {len(nachrichten)} Einträge\n"
            f"{'='*35}\n\n"
            f"{eintraege_text}\n\n"
            f"{'='*35}\n"
            f"Bauleiter: Mit 'Bestätigt' bestätigen.\n"
            f"Oder vollständiges Formular ausfüllen:"
        )
        await context.bot.send_message(
            chat_id=int(chat_id),
            text=text,
            reply_markup=app_button("Vollständiges Formular")
        )
    except Exception as e:
        log.error(f"Übersicht Fehler für {chat_id}: {e}")

async def tagesend_job(context: ContextTypes.DEFAULT_TYPE):
    """Täglich um 16:30 automatisch."""
    sb = get_supabase()
    result = sb.table("projekte").select("telegram_chat_id, name").eq("status","aktiv").execute()
    for p in (result.data or []):
        if p.get("telegram_chat_id"):
            await sende_tagesuebersicht(p["telegram_chat_id"], p["name"], context)

# ── Main ──────────────────────────────────────────────────────────
def main():
    if not BOT_TOKEN:
        log.error("BOT_TOKEN nicht gesetzt! In Railway unter Variables eintragen.")
        return

    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start",      cmd_start))
    app.add_handler(CommandHandler("status",     cmd_status))
    app.add_handler(CommandHandler("app",        cmd_app))
    app.add_handler(CommandHandler("uebersicht", cmd_uebersicht))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, nachricht_handler))

    app.job_queue.run_daily(
        tagesend_job,
        time=dtime(hour=TAGESENDE_H, minute=TAGESENDE_M),
        name="tagesabschluss"
    )

    log.info("="*50)
    log.info("  Bautagebuch Bot gestartet - Riedel Bau GmbH")
    log.info(f"  Supabase: {SUPABASE_URL}")
    log.info(f"  Tagesabschluss: {TAGESENDE_H}:{TAGESENDE_M:02d} Uhr")
    log.info("="*50)

    app.run_polling(drop_pending_updates=True)

if __name__ == "__main__":
    main()
