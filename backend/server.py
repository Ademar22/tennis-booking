import os
import re
import io
from datetime import datetime, date, time, timedelta, timezone
from typing import List, Optional, Literal

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel, EmailStr, Field, validator

from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

# PDF opcional (WeasyPrint)
try:
    from weasyprint import HTML as WeasyHTML
    WEASY_AVAILABLE = True
except Exception:
    WEASY_AVAILABLE = False

# ─────────────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI()

# CORS dinámico (útil para ngrok). Puedes pasar varios orígenes separados por coma.
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

# ─────────────────────────────────────────────────────────────────────────────
# MongoDB
# ─────────────────────────────────────────────────────────────────────────────
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME   = os.getenv("DB_NAME",   "tennis_booking_db")
client    = AsyncIOMotorClient(MONGO_URL)
db        = client[DB_NAME]

# ─────────────────────────────────────────────────────────────────────────────
# Admin / Config
# ─────────────────────────────────────────────────────────────────────────────
ADMIN_EMAIL    = os.getenv("ADMIN_EMAIL", "admin@tenniscourt.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
ADMIN_TOKEN    = os.getenv("ADMIN_TOKEN", "admin123token")

PAYMENT_MODE   = os.getenv("PAYMENT_MODE", "mock")  # 'mock'
PRICE_PER_HOUR = float(os.getenv("PRICE_PER_HOUR", "35"))
MOCK_DB        = {"charges": {}}  # cache en memoria (opcional)

VOUCHER_ADDRESS = "Tomas Marsano 2175, Surquillo"  # Dirección demo impresa en el voucher


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def soles_a_centimos(monto: float) -> int:
    return int(round(float(monto) * 100))


# ─────────────────────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────────────────────
class User(BaseModel):
    customer_name: str = Field(..., min_length=1)
    email:         EmailStr
    phone:         str
    password:      str = Field(..., min_length=6)

    @validator("phone")
    def validate_phone(cls, v):
        digits = re.sub(r"\D", "", v)
        if len(digits) != 9:
            raise ValueError("El teléfono debe tener exactamente 9 dígitos")
        return v.strip()


class UserLogin(BaseModel):
    email:    EmailStr
    password: str


class PublicUser(BaseModel):
    id:            str
    customer_name: str
    email:         EmailStr
    phone:         str


class Booking(BaseModel):
    customer_name: str
    email:         EmailStr
    phone:         str
    booking_date:  date
    start_time:    time
    court_number:  int = Field(..., ge=1, le=3)
    admin_comment: Optional[str] = Field(default=None, max_length=200)
    voucher_url:   Optional[str] = None   # ej: /voucher/ch_mock_xxx
    charge_id:     Optional[str] = None   # ej: ch_mock_xxx


class BookingInDB(BaseModel):
    id:            str
    customer_name: str
    email:         EmailStr
    phone:         str
    booking_date:  str
    start_time:    str
    end_time:      str
    court_number:  int
    status:        str
    admin_comment: Optional[str] = None
    voucher_url:   Optional[str] = None
    charge_id:     Optional[str] = None

    class Config:
        orm_mode = True


class AdminLogin(BaseModel):
    email:    EmailStr
    password: str


class PaymentRequest(BaseModel):
    amount_soles: float
    email: EmailStr
    method: Literal["card", "yape"] = "card"
    description: Optional[str] = "Pago de reserva (demo)"
    metadata: Optional[dict] = {}
    simulate: Optional[dict] = {}


# ─────────────────────────────────────────────────────────────────────────────
# Auth dep
# ─────────────────────────────────────────────────────────────────────────────
async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    if credentials.credentials != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid admin token")
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    charges_count = await db.charges.count_documents({})
    return {
        "ok": True,
        "payment_mode": PAYMENT_MODE,
        "price_per_hour": PRICE_PER_HOUR,
        "pdf": WEASY_AVAILABLE,
        "allowed_origins": ALLOWED_ORIGINS,
        "charges_in_db": charges_count
    }


# ─────────────────────────────────────────────────────────────────────────────
# Users
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/api/users/register", response_model=PublicUser, status_code=201)
async def register_user(user: User):
    if user.email.lower() == ADMIN_EMAIL.lower():
        raise HTTPException(status_code=400, detail="El correo pertenece a una cuenta de administrador")
    exists = await db.users.find_one({"email": user.email})
    if exists:
        raise HTTPException(status_code=400, detail="Email ya registrado")
    data = jsonable_encoder(user)
    res = await db.users.insert_one(data)
    return PublicUser(
        id=str(res.inserted_id),
        customer_name=user.customer_name,
        email=user.email,
        phone=user.phone
    )


@app.post("/api/users/login", response_model=PublicUser)
async def login_user(form: UserLogin):
    doc = await db.users.find_one({"email": form.email})
    if not doc or doc.get("password") != form.password:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    return PublicUser(
        id=str(doc["_id"]),
        customer_name=doc["customer_name"],
        email=doc["email"],
        phone=doc["phone"],
    )


# ─────────────────────────────────────────────────────────────────────────────
# Admin login
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/api/admin/login")
async def admin_login(admin: AdminLogin):
    if admin.email.lower() == ADMIN_EMAIL.lower() and admin.password == ADMIN_PASSWORD:
        return {"access_token": ADMIN_TOKEN, "email": ADMIN_EMAIL}
    raise HTTPException(status_code=401, detail="Credenciales inválidas")


# ─────────────────────────────────────────────────────────────────────────────
# Availability
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/availability/{booking_date}")
async def get_availability(booking_date: date):
    slots = []
    start  = datetime.combine(booking_date, time(hour=6))
    end_dt = datetime.combine(booking_date, time(hour=22))
    curr   = start
    while curr < end_dt:
        t_iso = curr.time().strftime("%H:%M")
        for court in (1, 2, 3):
            exists = await db.bookings.find_one({
                "booking_date": booking_date.isoformat(),
                "start_time":   t_iso,
                "court_number": court,
                "status":       "confirmed"
            })
            slots.append({
                "time":         t_iso,
                "court_number": court,
                "available":    exists is None
            })
        curr += timedelta(hours=1)
    return {"date": booking_date.isoformat(), "slots": slots}


# ─────────────────────────────────────────────────────────────────────────────
# Create booking
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/api/bookings", response_model=BookingInDB, status_code=201)
async def create_booking(booking: Booking):
    # conflicto
    conflict = await db.bookings.find_one({
        "booking_date": booking.booking_date.isoformat(),
        "start_time":   booking.start_time.strftime("%H:%M"),
        "court_number": booking.court_number,
        "status":       "confirmed"
    })
    if conflict:
        raise HTTPException(status_code=400, detail="Ese horario ya está reservado para esa cancha")

    # límite 2h (no admin)
    is_admin_email = booking.email.lower() == ADMIN_EMAIL.lower()
    if not is_admin_email:
        existing_count = await db.bookings.count_documents({
            "email":        booking.email,
            "booking_date": booking.booking_date.isoformat(),
            "court_number": booking.court_number,
            "status":       "confirmed"
        })
        if existing_count >= 2:
            raise HTTPException(status_code=400, detail="Límite de 2 horas por cancha y día alcanzado para este usuario")

    # inserción
    data = jsonable_encoder(booking)
    if isinstance(data["start_time"], str) and len(data["start_time"]) >= 5:
        data["start_time"] = data["start_time"][:5]

    # normaliza charge_id desde voucher_url si no vino explícito
    if not data.get("charge_id") and isinstance(data.get("voucher_url"), str):
        m = re.search(r"/voucher/([^/]+)", data["voucher_url"])
        if m:
            data["charge_id"] = m.group(1)

    start_dt = datetime.fromisoformat(f"{data['booking_date']}T{data['start_time']}")
    data["end_time"]   = (start_dt + timedelta(hours=1)).time().strftime("%H:%M")
    data["status"]     = "confirmed"
    data["created_at"] = now_iso()

    res = await db.bookings.insert_one(data)
    data["id"] = str(res.inserted_id)
    return data


# ─────────────────────────────────────────────────────────────────────────────
# My bookings / Admin
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/my-bookings/{email}", response_model=List[BookingInDB])
async def get_client_bookings(email: str):
    cursor = db.bookings.find({"email": email}).sort([("booking_date", 1), ("start_time", 1)])
    out = []
    async for doc in cursor:
        doc["id"] = str(doc["_id"])
        out.append(doc)
    return out


@app.get("/api/bookings/day/{booking_date}", response_model=List[BookingInDB])
async def list_day_bookings(booking_date: date, admin: bool = Depends(get_current_admin)):
    cursor = db.bookings.find({"booking_date": booking_date.isoformat(), "status": {"$ne":"cancelled"}})\
                        .sort([("court_number",1), ("start_time",1)])
    out = []
    async for doc in cursor:
        doc["id"] = str(doc["_id"])
        out.append(doc)
    return out


@app.get("/api/bookings", response_model=List[BookingInDB])
async def list_bookings(admin: bool = Depends(get_current_admin)):
    cursor = db.bookings.find({"status": {"$ne":"cancelled"}}).sort([("booking_date",1), ("start_time",1)])
    out = []
    async for doc in cursor:
        doc["id"] = str(doc["_id"])
        out.append(doc)
    return out


@app.post("/api/bookings/{booking_id}/cancel")
async def cancel_booking(booking_id: str, admin: bool = Depends(get_current_admin)):
    try:
        oid = ObjectId(booking_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid booking id")
    res = await db.bookings.update_one({"_id": oid}, {"$set": {"status":"cancelled"}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Booking not found")
    return {"detail": "Booking cancelled"}


# ─────────────────────────────────────────────────────────────────────────────
# Payments (mock) — guarda charge en Mongo para persistencia
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/api/payments/session")
async def create_payment_session(body: dict = None):
    body = body or {}
    session_id = f"ps_mock_{ObjectId()}"
    session = {
        "id": session_id,
        "payment_methods": ["card", "yape"],
        "created_at": now_iso(),
        "amount_soles": body.get("amount_soles"),
        "email": body.get("email"),
        "description": body.get("description"),
        "metadata": body.get("metadata") or {},
    }
    return {"ok": True, "session": session}


@app.post("/api/payments/charge")
async def mock_charge(req: PaymentRequest):
    if PAYMENT_MODE != "mock":
        raise HTTPException(status_code=400, detail="PAYMENT_MODE debe ser 'mock' para usar pagos demo.")

    status = "paid"
    if (req.simulate or {}).get("status") == "failed":
        status = "failed"

    charge_id = f"ch_mock_{ObjectId()}"
    charge_obj = {
        "id": charge_id,
        "status": status,
        "amount": soles_a_centimos(req.amount_soles),
        "amount_soles": float(round(req.amount_soles, 2)),
        "currency": "PEN",
        "email": str(req.email),
        "method": req.method,  # "card" | "yape"
        "description": req.description or "Pago de reserva (demo)",
        "metadata": req.metadata or {},  # aquí puede venir 'admin_comment'
        "created_at": now_iso(),
        "voucher_url": f"/voucher/{charge_id}"
    }
    # memoria + persistencia en Mongo
    MOCK_DB["charges"][charge_id] = charge_obj
    await db.charges.update_one({"id": charge_id}, {"$set": charge_obj}, upsert=True)

    ok = status == "paid"
    return {"ok": ok, "charge": charge_obj}


@app.get("/api/payments/charges")
async def list_mock_charges():
    cursor = db.charges.find({}).sort([("created_at", -1)])
    out = []
    async for c in cursor:
        c["mongo_id"] = str(c["_id"])
        out.append(c)
    return {"ok": True, "charges": out}


# ─────────────────────────────────────────────────────────────────────────────
# Voucher helpers (reconstrucción por charge_id/voucher_url)
# ─────────────────────────────────────────────────────────────────────────────
async def _load_charge(charge_id: str) -> Optional[dict]:
    # 1) memoria
    ch = MOCK_DB["charges"].get(charge_id)
    if ch:
        return ch
    # 2) Mongo (charges)
    doc = await db.charges.find_one({"id": charge_id})
    if doc:
        return doc
    # 3) Reconstrucción desde reservas por charge_id
    bookings = [b async for b in db.bookings.find({"charge_id": charge_id}).sort([("booking_date", 1), ("start_time", 1)])]
    if not bookings:
        # 4) Respaldo: por voucher_url exacto y regex (pudo guardarse con URL absoluta)
        vurl = f"/voucher/{charge_id}"
        bookings = [b async for b in db.bookings.find({"voucher_url": vurl}).sort([("booking_date", 1), ("start_time", 1)])]
        if not bookings:
            bookings = [b async for b in db.bookings.find({"voucher_url": {"$regex": charge_id}}).sort([("booking_date", 1), ("start_time", 1)])]
    if not bookings:
        return None

    first = bookings[0]
    last  = bookings[-1]
    n_hours = len(bookings)

    court   = first.get("court_number")
    date_   = first.get("booking_date")
    start   = first.get("start_time")
    end     = last.get("end_time")
    cname   = first.get("customer_name")
    email   = first.get("email")
    admin_comment = first.get("admin_comment") or None

    meta = {
        "reservation_id": str(first.get("_id")),
        "court": court,
        "date": date_,
        "start": start,
        "end": end,
        "customer_name": cname,
    }
    if admin_comment:
        meta["admin_comment"] = admin_comment

    charge_obj = {
        "id": charge_id,
        "status": "paid",
        "amount": int(PRICE_PER_HOUR * 100 * n_hours),
        "amount_soles": float(PRICE_PER_HOUR * n_hours),
        "currency": "PEN",
        "email": email,
        "method": "mock",
        "description": f"Reserva Cancha {court} | {start}–{end} ({n_hours}h)",
        "metadata": meta,
        "created_at": now_iso(),
        "voucher_url": f"/voucher/{charge_id}",
    }
    return charge_obj


def _build_voucher_html(charge: dict) -> str:
    r = charge.get("metadata") or {}
    status_ok = (charge["status"] == "paid")
    status_label = "PAGADO" if status_ok else "RECHAZADO"
    state_class  = "ok" if status_ok else "fail"

    cancha   = r.get("court", "-")
    fecha    = r.get("date", "-")
    inicio   = r.get("start", "-")
    fin      = r.get("end", "-")
    cliente  = r.get("customer_name") or charge.get("email")
    comment  = r.get("admin_comment") or r.get("comment") or None  # solo lo envía Admin
    metodo   = (charge.get("method") or "mock").upper()

    # Fila opcional para comentario (solo si viene)
    comment_row = ""
    if comment:
        comment_row = f"""
      <div class="row"><div class="label">Comentario</div><div class="strong">{comment}</div></div>"""

    return f"""
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Voucher #{charge['id']}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  :root {{ --w: 340px; }}
  * {{ box-sizing: border-box; }}
  body {{
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: #f5f7fb;
    margin: 0; padding: 20px;
    display: flex; justify-content: center;
  }}
  .stub {{
    width: var(--w);
    background: #fff;
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 6px 22px rgba(16,24,40,.08);
    border: 1px solid #eef2f7;
  }}
  .head {{
    background: linear-gradient(135deg, #10b981, #059669);
    color: #fff; padding: 16px 14px;
    position: relative;
  }}
  .brand {{ font-weight: 700; letter-spacing: .3px; }}
  .state {{ position:absolute; right:12px; top:12px; font-size:12px; padding:4px 8px; border-radius:999px; background: rgba(255,255,255,.2); }}
  .ok {{ border:1px solid rgba(255,255,255,.5) }}
  .fail {{ background:#ef4444 }}
  .amount {{
    font-size: 24px; font-weight: 800; margin-top: 8px;
  }}
  .body {{ padding: 14px; position: relative; }}
  .perforation {{
    position: relative; height: 14px; margin: 0 0 10px;
    background:
      radial-gradient(circle at 7px 7px, #f5f7fb 6px, transparent 7px) left/14px 14px repeat-x,
      linear-gradient(#e5e7eb,#e5e7eb) center/100% 1px no-repeat;
  }}
  .row {{ display:flex; justify-content:space-between; margin:6px 0; font-size: 14px; }}
  .muted {{ color:#6b7280 }}
  .label {{ color:#6b7280; font-size:12px }}
  .strong {{ font-weight:600 }}
  .footer {{ padding: 0 14px 14px; }}
  .btn {{
    display:block; width:100%; text-align:center;
    padding:10px 12px; border:1px solid #0f172a;
    border-radius: 10px; text-decoration:none; color:#0f172a; font-weight:600;
    margin-top: 8px;
  }}
  @media print {{
    body {{ background:#fff; padding:0; }}
    .btn {{ display:none; }}
  }}
</style>
</head>
<body>
  <div class="stub">
    <div class="head">
      <div class="brand">Tennis Court Booking</div>
      <div class="state {state_class}">{status_label}</div>
      <div class="amount">Total: S/ {charge['amount_soles']:.2f}</div>
      <div class="muted" style="font-size:12px; margin-top: 4px;">{metodo} · Ref {charge['id']}</div>
    </div>

    <div class="body">
      <div class="perforation"></div>

      <div class="row"><div class="label">Cliente</div><div class="strong">{cliente}</div></div>
      <div class="row"><div class="label">Cancha</div><div class="strong">{cancha}</div></div>
      <div class="row"><div class="label">Día</div><div class="strong">{fecha}</div></div>
      <div class="row"><div class="label">Horario</div><div class="strong">{inicio} – {fin}</div></div>
      <div class="row"><div class="label">Dirección</div><div class="strong">{VOUCHER_ADDRESS}</div></div>
      {comment_row}
    </div>

    <div class="footer">
      <a class="btn" href="javascript:window.print()">Imprimir / Guardar PDF</a>
      <div class="muted" style="text-align:center; font-size:12px; margin-top:6px;">
        Demo · No representa una transacción real.
      </div>
    </div>
  </div>
</body>
</html>
""".strip()


def _fallback_charge_from_query(charge_id: str, qp) -> Optional[dict]:
    """
    Construye un 'charge' sintético a partir de los query params si no se encontró en DB.
    Requiere: court, date (YYYY-MM-DD), start (HH:MM), end (HH:MM), name o email.
    Acepta opcionalmente: comment.
    """
    if qp.get("fallback") != "1":
        return None
    court = qp.get("court")
    date_ = qp.get("date")
    start = qp.get("start")
    end   = qp.get("end")
    name  = qp.get("name") or ""
    email = qp.get("email") or ""
    comment = qp.get("comment") or None

    if not (court and date_ and start and end):
        return None

    try:
        hh0 = int(start.split(":")[0]); hh1 = int(end.split(":")[0])
        n_hours = max(1, min(6, hh1 - hh0))
    except Exception:
        n_hours = 1

    meta = {
        "court": int(court),
        "date": date_,
        "start": start,
        "end": end,
        "customer_name": name or email or "Cliente",
    }
    if comment:
        meta["admin_comment"] = comment

    return {
        "id": charge_id,
        "status": "paid",
        "amount": int(PRICE_PER_HOUR * 100 * n_hours),
        "amount_soles": float(PRICE_PER_HOUR * n_hours),
        "currency": "PEN",
        "email": email or "demo@example.com",
        "method": "mock",  # para el flujo "Otro" (sin pasar por /charge)
        "description": f"Reserva Cancha {court} | {start}–{end} ({n_hours}h)",
        "metadata": meta,
        "created_at": now_iso(),
        "voucher_url": f"/voucher/{charge_id}",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Voucher endpoints
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/voucher/{charge_id}", response_class=HTMLResponse)
async def voucher_html(charge_id: str, request: Request):
    charge = await _load_charge(charge_id)
    if not charge:
        charge = _fallback_charge_from_query(charge_id, request.query_params)
    if not charge:
        raise HTTPException(status_code=404, detail="Voucher no encontrado")
    html = _build_voucher_html(charge)
    return HTMLResponse(content=html, status_code=200)


@app.get("/voucher/{charge_id}.pdf")
async def voucher_pdf(charge_id: str, request: Request):
    charge = await _load_charge(charge_id)
    if not charge:
        charge = _fallback_charge_from_query(charge_id, request.query_params)
    if not charge:
        raise HTTPException(status_code=404, detail="Voucher no encontrado")
    html = _build_voucher_html(charge)
    if WEASY_AVAILABLE:
        pdf_bytes = WeasyHTML(string=html).write_pdf()
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="voucher_{charge_id}.pdf"'}
        )
    # Fallback a HTML si no hay WeasyPrint
    return HTMLResponse(content=html, status_code=200)
