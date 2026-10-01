"""
Bautagebuch Telegram Bot - Riedel Bau GmbH
===========================================
Läuft auf Railway.app — 24/7, kein PC nötig.

Daten liegen im gemeinsamen Supabase-Projekt der Riedel-Tools (riedel-stahllisten).
Jede Telegram-Gruppe wird einmalig mit einer Kostenstelle verknüpft:
    /kostenstelle 7421341
Danach landen die Nachrichten der Gruppe in dieser Kostenstelle; mit „Bestätigt“
wird daraus ein Tagesbericht (Tabelle bt_berichte).

Umgebungsvariablen in Railway setzen:
  BOT_TOKEN    = Telegram Bot Token
  SUPABASE_URL = https://sazhfayopozqcluvmqqu.supabase.co
  SUPABASE_KEY = service_role-Schlüssel des Supabase-Projekts (geheim! nur hier eintragen,
                 nie in den Code). Der Bot schreibt an den Freigaben vorbei, daher dieser Schlüssel.
  BOT_ADMINS   = Telegram-User-IDs (kommagetrennt), die Gruppen mit Kostenstellen verknüpfen dürfen.
                 Leer = jeder in der Gruppe darf verknüpfen.
  APP_URL      = Link zum Bautagebuch (optional)
"""

import os, logging
from datetime import datetime, time as dtime
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, MessageHandler, CommandHandler, filters, ContextTypes
from supabase import create_client

# ── Konfiguration aus Umgebungsvariablen ──────────────────────────
BOT_TOKEN     = os.environ.get("BOT_TOKEN", "")
SUPABASE_URL  = os.environ.get("SUPABASE_URL", "https://sazhfayopozqcluvmqqu.supabase.co")
SUPABASE_KEY  = os.environ.get("SUPABASE_KEY", "")
APP_URL       = os.environ.get("APP_URL", "https://simonriedelbau.github.io/riedel-tools/bautagebuch/")
TAGESENDE_H   = int(os.environ.get("TAGESENDE_H", "16"))
TAGESENDE_M   = int(os.environ.get("TAGESENDE_M", "30"))
BOT_ADMINS    = {x.strip() for x in os.environ.get("BOT_ADMINS", "").split(",") if x.strip()}

BESTAETIGUNG = ["bestätigt","bestaetigt","ok","confirmed","passt","✅","👍"]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger(__name__)

# ── Supabase Client ───────────────────────────────────────────────
_sb = None
def get_supabase():
    global _sb
    if _sb is None:
        _sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _sb

# ── Kostenstelle der Gruppe ───────────────────────────────────────
def get_kostenstelle(chat_id: str):
    """Kostenstelle, die mit dieser Telegram-Gruppe verknüpft ist (oder None)."""
    r = get_supabase().table("kostenstellen").select("nr, name").eq("telegram_chat_id", chat_id).execute()
    return r.data[0] if r.data else None

def verknuepfe_kostenstelle(chat_id: str, nr: str):
    sb = get_supabase()
    r = sb.table("kostenstellen").select("nr, name, telegram_chat_id").eq("nr", nr).execute()
    if not r.data:
        return None, f"Kostenstelle {nr} gibt es nicht. Ein Admin legt sie auf der Startseite der Riedel-Tools an."
    k = r.data[0]
    if k.get("telegram_chat_id") and k["telegram_chat_id"] != chat_id:
        return None, f"Kostenstelle {nr} ist schon mit einer anderen Gruppe verknüpft."
    # alte Verknüpfung dieser Gruppe lösen, neue setzen
    sb.table("kostenstellen").update({"telegram_chat_id": None}).eq("telegram_chat_id", chat_id).execute()
    sb.table("kostenstellen").update({"telegram_chat_id": chat_id}).eq("nr", nr).execute()
    return k, None

NICHT_VERKNUEPFT = ("Diese Gruppe ist noch keiner Kostenstelle zugeordnet.\n"
                    "Bitte einmal senden: /kostenstelle <Nummer>  (z. B. /kostenstelle 7421341)")

def save_nachricht(kst: str, chat_id: str, absender: str, text: str):
    get_supabase().table("bt_telegram_nachrichten").insert({
        "kostenstelle": kst,
        "chat_id": chat_id,
        "absender": absender,
        "text": text,
        "datum": datetime.now().date().isoformat(),
        "verarbeitet": False
    }).execute()

def get_heutige_nachrichten(kst: str):
    heute = datetime.now().date().isoformat()
    result = get_supabase().table("bt_telegram_nachrichten")\
        .select("*")\
        .eq("kostenstelle", kst)\
        .eq("datum", heute)\
        .order("zeitpunkt")\
        .execute()
    return result.data or []

def get_naechste_blatt_nr(kst: str) -> int:
    result = get_supabase().table("bt_berichte")\
        .select("blatt_nr")\
        .eq("kostenstelle", kst)\
        .order("blatt_nr", desc=True)\
        .limit(1)\
        .execute()
    if result.data:
        return result.data[0]["blatt_nr"] + 1
    return 1

def speichere_bericht(kst: str, nachrichten: list, blatt_nr: int):
    sb = get_supabase()
    arbeiten_text = "\n".join([
        f"[{n.get('zeitpunkt','')[:16].replace('T',' ')}] {n['absender']}: {n['text']}"
        for n in nachrichten
    ])
    heute = datetime.now().date().isoformat()
    result = sb.table("bt_berichte").insert({
        "kostenstelle": kst,
        "blatt_nr": blatt_nr,
        "datum": heute,
        "ausgefuehrte_arbeiten": arbeiten_text,
        "status": "bestaetigt",
        "bestaetigt_am": datetime.now().isoformat(),
        "quelle": "telegram"
    }).execute()
    # Nachrichten als verarbeitet markieren
    sb.table("bt_telegram_nachrichten")\
        .update({"verarbeitet": True})\
        .eq("kostenstelle", kst)\
        .eq("datum", heute)\
        .execute()
    return result.data[0] if result.data else None

# ── App Button ────────────────────────────────────────────────────
def app_button(text="App öffnen"):
    return InlineKeyboardMarkup([[InlineKeyboardButton(text, url=APP_URL)]])

# ── Handlers ──────────────────────────────────────────────────────
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id   = str(update.effective_chat.id)
    try:
        projekt = get_kostenstelle(chat_id)
        if not projekt:
            await update.message.reply_text("Bautagebuch Bot aktiv!\n\n" + NICHT_VERKNUEPFT)
            return
        await update.message.reply_text(
            f"Bautagebuch Bot aktiv!\n"
            f"Kostenstelle {projekt['nr']}: {projekt['name']}\n\n"
            f"Schreibt einfach was ihr gemacht habt.\n"
            f"Um {TAGESENDE_H}:{TAGESENDE_M:02d} Uhr kommt die Tagesübersicht.\n"
            f"Bauleiter bestätigt mit: Bestätigt\n\n"
            f"/status – heutige Einträge\n"
            f"/kostenstelle <Nr> – Gruppe einer anderen Kostenstelle zuordnen\n"
            f"/uebersicht – Zusammenfassung jetzt\n"
            f"/app – App öffnen",
            reply_markup=app_button("Bautagebuch App öffnen")
        )
    except Exception as e:
        log.error(f"Start Fehler: {e}")
        await update.message.reply_text(f"Fehler beim Starten: {e}")

async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = str(update.effective_chat.id)
    try:
        projekt = get_kostenstelle(chat_id)
        if not projekt:
            await update.message.reply_text(NICHT_VERKNUEPFT)
            return
        nachrichten = get_heutige_nachrichten(projekt["nr"])
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
    try:
        projekt = get_kostenstelle(chat_id)
        if not projekt:
            await update.message.reply_text(NICHT_VERKNUEPFT)
            return
        await update.message.reply_text(
            f"Bautagebuch App für: {projekt['name']}\n"
            f"Vollständiges Formular, Wetter, Archiv:",
            reply_markup=app_button("App öffnen")
        )
    except Exception as e:
        await update.message.reply_text(f"Fehler: {e}")

async def cmd_kostenstelle(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = str(update.effective_chat.id)
    user_id = str(update.effective_user.id) if update.effective_user else ""
    if BOT_ADMINS and user_id not in BOT_ADMINS:
        await update.message.reply_text("Nur berechtigte Personen dürfen die Gruppe einer Kostenstelle zuordnen.")
        return
    if not context.args:
        k = get_kostenstelle(chat_id)
        await update.message.reply_text(
            (f"Diese Gruppe gehört zu Kostenstelle {k['nr']}: {k['name']}.\n\n" if k else "") +
            "Zuordnen mit: /kostenstelle <Nummer>")
        return
    nr = context.args[0].strip()
    try:
        k, fehler = verknuepfe_kostenstelle(chat_id, nr)
        if fehler:
            await update.message.reply_text(fehler)
            return
        await update.message.reply_text(
            f"Verknüpft mit Kostenstelle {k['nr']}: {k['name']}.\n"
            f"Schreibt einfach, was ihr gemacht habt. Um {TAGESENDE_H}:{TAGESENDE_M:02d} Uhr kommt die Tagesübersicht.",
            reply_markup=app_button("Bautagebuch öffnen"))
    except Exception as e:
        log.error(f"Verknüpfen fehlgeschlagen: {e}")
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
        projekt = get_kostenstelle(chat_id)
        if not projekt:
            return  # Gruppe noch nicht verknüpft – Hinweis kommt bei /start bzw. /status

        # Bestätigung prüfen
        if any(b in text.lower() for b in BESTAETIGUNG):
            nachrichten = get_heutige_nachrichten(projekt["nr"])
            if not nachrichten:
                await msg.reply_text("Heute noch keine Einträge zum Bestätigen.")
                return
            blatt_nr = get_naechste_blatt_nr(projekt["nr"])
            await msg.reply_text("Bestätigt! Speichere Bericht...")
            speichere_bericht(projekt["nr"], nachrichten, blatt_nr)
            await msg.reply_text(
                f"Bericht Blatt {blatt_nr} gespeichert!\n"
                f"Projekt: {projekt['name']}\n"
                f"Einträge: {len(nachrichten)}\n\n"
                f"Für PDF-Export und vollständiges Formular:",
                reply_markup=app_button("PDF in App erstellen")
            )
            return

        # Normale Nachricht speichern
        save_nachricht(projekt["nr"], chat_id, absender, text)
        log.info(f"[{projekt['name']}] {absender}: {text[:60]}")

    except Exception as e:
        log.error(f"Nachricht Fehler: {e}", exc_info=True)

async def sende_tagesuebersicht(chat_id: str, chat_name: str, context):
    try:
        projekt = get_kostenstelle(chat_id)
        if not projekt:
            return
        nachrichten = get_heutige_nachrichten(projekt["nr"])
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
    result = sb.table("kostenstellen").select("telegram_chat_id, name").eq("aktiv", True).not_.is_("telegram_chat_id", "null").execute()
    for p in (result.data or []):
        if p.get("telegram_chat_id"):
            await sende_tagesuebersicht(p["telegram_chat_id"], p["name"], context)

# ── Main ──────────────────────────────────────────────────────────
def main():
    if not BOT_TOKEN:
        log.error("BOT_TOKEN nicht gesetzt! In Railway unter Variables eintragen.")
        return
    if not SUPABASE_KEY:
        log.error("SUPABASE_KEY nicht gesetzt! service_role-Schlüssel in Railway unter Variables eintragen.")
        return

    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start",      cmd_start))
    app.add_handler(CommandHandler("status",     cmd_status))
    app.add_handler(CommandHandler("app",        cmd_app))
    app.add_handler(CommandHandler("uebersicht", cmd_uebersicht))
    app.add_handler(CommandHandler("kostenstelle", cmd_kostenstelle))
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
