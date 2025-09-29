import React, { useState, useEffect, useRef } from 'react'
import { Calendar } from './components/ui/calendar'
import { Button } from './components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './components/ui/dialog'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from './components/ui/table'
import { Alert, AlertDescription } from './components/ui/alert'
import { Separator } from './components/ui/separator'
import { CalendarDays, Clock, Users, CheckCircle, AlertCircle, LogOut } from 'lucide-react'
import './App.css'

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001'
const ADMIN_EMAIL = 'admin@tenniscourt.com'
const HOURS = Array.from({length:16},(_,i)=>6+i) // 06:00–21:00
const PRICE_PER_HOUR = Number(process.env.REACT_APP_PRICE_PER_HOUR || 35)
const API_BASE = `${BACKEND_URL}/api`

function hourFromHHMM(hhmm){ return parseInt(hhmm.split(':')[0],10) }

function mergeContiguous(bookings){
  const sorted = [...bookings].sort((a,b)=>{
    if(a.booking_date!==b.booking_date) return a.booking_date.localeCompare(b.booking_date)
    if(a.court_number!==b.court_number) return a.court_number-b.court_number
    return a.start_time.localeCompare(b.start_time)
  })
  const out = []
  for(const b of sorted){
    const last = out[out.length-1]
    if(
      last &&
      last.booking_date===b.booking_date &&
      last.court_number===b.court_number &&
      last.email===b.email &&
      hourFromHHMM(last.end_time) === hourFromHHMM(b.start_time)
    ){
      last.end_time = b.end_time
      if(b.admin_comment && !last.admin_comment) last.admin_comment = b.admin_comment
      if(b.voucher_url && !last.voucher_url) last.voucher_url = b.voucher_url
      if(b.charge_id && !last.charge_id) last.charge_id = b.charge_id
      if(b.payment_type && !last.payment_type) last.payment_type = b.payment_type
    }else{
      out.push({...b})
    }
  }
  return out
}

// Toast mínimo
function toastInline(msg){
  let t = document.getElementById("toast-inline")
  if(!t){
    t = document.createElement('div')
    t.id = "toast-inline"
    t.style.position = "fixed"
    t.style.right = "16px"
    t.style.bottom = "16px"
    t.style.padding = "12px 14px"
    t.style.borderRadius = "10px"
    t.style.background = "#111"
    t.style.color = "#fff"
    t.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    t.style.zIndex = "999999"
    document.body.appendChild(t)
  }
  t.textContent = msg
  clearTimeout(t._tid)
  t._tid = setTimeout(()=>{ if(t) t.textContent="" }, 3000)
}

// Modal pago DEMO (con máscaras)
function buildPayHTML({amountSoles, email, description, currency='PEN'}){
  const amountTxt = `S/ ${Number(amountSoles).toFixed(2)} ${currency}`
  return `
  <div id="pay-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:99999;">
    <div style="width:min(520px, 92vw); background:#fff; border-radius:16px; padding:18px; font-family:system-ui, -apple-system, Segoe UI, Roboto, sans-serif;">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <h3 style="margin:0; font-size:18px">Pago de reserva (Demo)</h3>
        <button id="pay-x" style="border:none; background:transparent; font-size:22px; cursor:pointer">×</button>
      </div>
      <p style="margin:6px 0 10px; color:#6b7280">${description || 'Pago de reserva'}</p>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
        <div>
          <label style="font-size:12px; color:#6b7280">Email</label>
          <input id="pay-email" value="${email || ''}" autocomplete="email"
                 style="width:100%; padding:10px; border:1px solid #e5e7eb; border-radius:10px"/>
        </div>
        <div>
          <label style="font-size:12px; color:#6b7280">Monto</label>
          <input id="pay-amount" type="number" step="0.01" value="${Number(amountSoles).toFixed(2)}"
                 style="width:100%; padding:10px; border:1px solid #e5e7eb; border-radius:10px"/>
        </div>
      </div>

      <div style="margin-top:14px">
        <div style="display:flex; gap:8px; margin-bottom:10px">
          <button id="tab-card" style="flex:1; padding:10px; border:1px solid #111; background:#111; color:#fff; border-radius:10px; cursor:pointer">Tarjeta</button>
          <button id="tab-yape" style="flex:1; padding:10px; border:1px solid #e5e7eb; background:#fff; border-radius:10px; cursor:pointer">Yape</button>
        </div>

        <div id="content-card">
          <label style="font-size:12px; color:#6b7280">Número de tarjeta</label>
          <input id="card-number" placeholder="0000 0000 0000 0000" inputmode="numeric" autocomplete="cc-number" maxlength="19"
                 style="width:100%; padding:10px; border:1px solid #e5e7eb; border-radius:10px"/>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px">
            <div>
              <label style="font-size:12px; color:#6b7280">Vencimiento (MM/AA)</label>
              <input id="card-exp" placeholder="MM/AA" inputmode="numeric" autocomplete="cc-exp" maxlength="5"
                     style="width:100%; padding:10px; border:1px solid #e5e7eb; border-radius:10px"/>
            </div>
            <div>
              <label style="font-size:12px; color:#6b7280">CVV</label>
              <input id="card-cvv" placeholder="000" inputmode="numeric" autocomplete="cc-csc" maxlength="3"
                     style="width:100%; padding:10px; border:1px solid #e5e7eb; border-radius:10px"/>
            </div>
          </div>
        </div>

        <div id="content-yape" style="display:none">
          <p style="margin:8px 0 6px">Escanea el “QR” demo o ingresa un código ficticio.</p>
          <div style="border:1px dashed #9ca3af; border-radius:12px; height:140px; display:flex; align-items:center; justify-content:center; color:#9ca3af">
            (QR demo)
          </div>
          <label style="font-size:12px; color:#6b7280">Código</label>
          <input id="yape-code" placeholder="000000" inputmode="numeric" maxlength="6"
                 style="width:100%; padding:10px; border:1px solid #e5e7eb; border-radius:10px"/>
        </div>
      </div>

      <div id="pay-status" style="margin-top:12px; color:#6b7280"></div>

      <div style="display:flex; gap:8px; margin-top:12px">
        <button id="pay-ok" style="flex:1; padding:12px; border:none; border-radius:10px; background:#16a34a; color:#fff; cursor:pointer">
          Pagar ${amountTxt}
        </button>
        <button id="pay-cancel" style="padding:12px; border:1px solid #e5e7eb; border-radius:10px; background:#fff; cursor:pointer">
          Cancelar
        </button>
      </div>

      <p style="margin-top:8px; color:#9ca3af; font-size:12px">* Demo: no se realiza un cargo real.</p>
    </div>
  </div>`
}

function openDemoCheckout({ amountSoles, email, description, metadata={} }){
  const maxDigits = 16
  // Máscara MM/AA flexible
  const fmtExp = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 4)
    if (d.length <= 2) return d
    let mm = parseInt(d.slice(0,2), 10)
    if (isNaN(mm) || mm < 1) mm = 1
    if (mm > 12) mm = 12
    const yy = d.slice(2,4)
    return yy ? `${String(mm).padStart(2,'0')}/${yy}` : `${String(mm).padStart(2,'0')}/`
  }
  const fmtCard = (v) => v.replace(/\D/g, '').slice(0, maxDigits).replace(/(\d{4})(?=\d)/g, '$1 ').trim()
  const fmtCVV  = (v) => v.replace(/\D/g, '').slice(0,3)
  const isValidExp = (s) => /^\d{2}\/\d{2}$/.test(s) && (() => {
    const [mm, yy] = s.split('/').map(x=>parseInt(x,10))
    return mm>=1 && mm<=12
  })()

  return new Promise((resolve, reject)=>{
    const wrap = document.createElement('div')
    wrap.innerHTML = buildPayHTML({amountSoles, email, description})
    document.body.appendChild(wrap)

    const $ = (sel)=>wrap.querySelector(sel)
    const status = $("#pay-status")
    const setStatus = (txt)=> status && (status.textContent = txt || "")

    const tabCard = $("#tab-card")
    const tabYape = $("#tab-yape")
    const contentCard = $("#content-card")
    const contentYape = $("#content-yape")
    const activate = (which)=>{
      if(which==='yape'){
        tabYape.style.background="#111"; tabYape.style.color="#fff"; tabYape.style.border="1px solid #111"
        tabCard.style.background="#fff"; tabCard.style.color="#111"; tabCard.style.border="1px solid #e5e7eb"
        contentYape.style.display=""; contentCard.style.display="none"
      }else{
        tabCard.style.background="#111"; tabCard.style.color="#fff"; tabCard.style.border="1px solid #111"
        tabYape.style.background="#fff"; tabYape.style.color="#111"; tabYape.style.border="1px solid #e5e7eb"
        contentCard.style.display=""; contentYape.style.display="none"
      }
    }
    tabCard.onclick = ()=>activate('card')
    tabYape.onclick = ()=>activate('yape')
    activate('card')

    const card = $("#card-number"), exp = $("#card-exp"), cvv = $("#card-cvv"), yape = $("#yape-code")
    if(card){ card.addEventListener('input', ()=> card.value = fmtCard(card.value)) }
    if(exp){  exp .addEventListener('input', ()=> exp .value = fmtExp (exp .value)) }
    if(cvv){  cvv .addEventListener('input', ()=> cvv .value = fmtCVV (cvv .value)) }
    if(yape){ yape.addEventListener('input', ()=> yape.value = yape.value.replace(/\D/g,'').slice(0,6)) }

    // Auto-activar/foco del modal de pago
    const overlay = $("#pay-overlay")
    if (overlay) { overlay.setAttribute('tabindex','-1') }
    setTimeout(()=>{
      try{
        overlay && overlay.focus()
        const emailEl = $("#pay-email")
        const cardEl  = $("#card-number")
        if(emailEl && !emailEl.value) emailEl.focus()
        else if(cardEl) cardEl.focus()
      }catch{}
    },0)

    const close = ()=>wrap.remove()
    $("#pay-x").onclick = ()=>{ toastInline("Pago cancelado"); close(); reject(new Error("cancelled")) }
    $("#pay-cancel").onclick = ()=>{ toastInline("Pago cancelado"); close(); reject(new Error("cancelled")) }

    $("#pay-ok").onclick = async ()=>{
      const method = (contentYape.style.display==="" ? "yape" : "card")
      const emailVal = $("#pay-email").value.trim()
      const amountVal = Number($("#pay-amount").value || amountSoles)
      if(!emailVal){ toastInline("Ingresa un email válido"); return }
      if(!amountVal || amountVal<=0){ toastInline("Monto inválido"); return }

      if(method==='card'){
        const digits = (card.value||'').replace(/\D/g,'')
        if(digits.length !== maxDigits){ toastInline("Tarjeta inválida (16 dígitos)"); return }
        if(!isValidExp(exp.value||'')){ toastInline("Vencimiento inválido (MM/AA)"); return }
        if((cvv.value||'').length !== 3){ toastInline("CVV inválido (3 dígitos)"); return }
      }else{
        const code = (yape.value||'').trim()
        if(code.length < 6){ toastInline("Código Yape inválido (6 dígitos)"); return }
      }

      try{
        setStatus("Procesando pago…")
        const resp = await fetch(`${API_BASE}/payments/charge`, {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({
            amount_soles: amountVal,
            email: emailVal,
            method,
            description,
            metadata
          })
        })
        const data = await resp.json()
        if(!data.ok){ setStatus(""); toastInline("Pago rechazado (demo)"); reject(new Error("failed")); return }
        setStatus("Pago aprobado ✅")
        close()
        resolve(data.charge)  // { id, voucher_url, ... }
      }catch(e){
        console.error(e)
        setStatus("")
        toastInline("Error procesando el pago (demo)")
        reject(e)
      }
    }
  })
}

// Selector flotante para Admin
function chooseAdminPaymentMode(){
  return new Promise((resolve, reject)=>{
    const wrap = document.createElement('div')
    wrap.innerHTML = `
    <div id="admin-pay-choice" style="position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:99999;">
      <div style="width:min(420px, 92vw); background:#fff; border-radius:16px; padding:18px; font-family:system-ui, -apple-system, Segoe UI, Roboto, sans-serif;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <h3 style="margin:0; font-size:18px">Método de registro (Admin)</h3>
          <button id="apc-x" style="border:none; background:transparent; font-size:22px; cursor:pointer">×</button>
        </div>
        <p style="margin:6px 0 10px; color:#6b7280">Elige cómo registrar esta reserva:</p>
        <div style="display:flex; gap:10px; margin-top:8px">
          <button id="apc-card"  style="flex:1; padding:12px; border:none; border-radius:10px; background:#16a34a; color:#fff; cursor:pointer">Pago con tarjeta</button>
          <button id="apc-other" style="flex:1; padding:12px; border:none; border-radius:10px; background:#16a34a; color:#fff; cursor:pointer">Otro</button>
        </div>
        <p style="margin-top:8px; color:#9ca3af; font-size:12px">“Otro” confirma sin pasar por el flujo de cobro.</p>
      </div>
    </div>`
    document.body.appendChild(wrap)
    const $ = (s)=>wrap.querySelector(s)

    // Auto-activar/foco del modal de selección
    const overlay = $("#admin-pay-choice")
    if (overlay) overlay.setAttribute('tabindex','-1')
    setTimeout(()=>{
      try{
        overlay && overlay.focus()
        const firstBtn = $("#apc-card")
        firstBtn && firstBtn.focus()
      }catch{}
    },0)

    const close = ()=>wrap.remove()
    $("#apc-x").onclick = ()=>{ close(); reject(new Error('cancelled')) }
    $("#apc-card").onclick  = ()=>{ close(); resolve('card') }
    $("#apc-other").onclick = ()=>{ close(); resolve('other') }
  })
}

// Construye URL de voucher con fallback params (si no hay charge)
function buildVoucherURL({charge, court, dateStr, startHH, endHH, name, email, comment}){
  let base
  if (charge && charge.voucher_url) {
    base = charge.voucher_url.startsWith('http')
      ? charge.voucher_url
      : `${BACKEND_URL}${charge.voucher_url}`
  } else {
    const id = (charge && charge.id) ? charge.id : 'ch_mock_unknown'
    base = `${BACKEND_URL}/voucher/${id}`
  }
  const u = new URL(base)
  u.searchParams.set('fallback', '1')
  u.searchParams.set('court', String(court))
  u.searchParams.set('date', dateStr)
  u.searchParams.set('start', `${startHH.toString().padStart(2,'0')}:00`)
  u.searchParams.set('end',   `${endHH.toString().padStart(2,'0')}:00`)
  if(name)  u.searchParams.set('name',  name)
  if(email) u.searchParams.set('email', email)
  if(comment) u.searchParams.set('comment', comment)
  return u.toString()
}

export default function App() {
  const [activeTab, setActiveTab] = useState('home')

  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminToken, setAdminToken] = useState(null)

  const [userForm, setUserForm] = useState({ customer_name:'', email:'', phone:'', password:'' })

  const [message, setMessage] = useState(null)
  useEffect(()=>{
    if(message){
      const id = setTimeout(()=>setMessage(null), 3000)
      return ()=>clearTimeout(id)
    }
  }, [message])

  const [selectedDate, setSelectedDate] = useState(new Date())
  const [availability, setAvailability] = useState(new Set())
  const [court, setCourt] = useState(1)
  const [selStart, setSelStart] = useState(null)
  const [selEnd, setSelEnd] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')
  const [clientBookings, setClientBookings] = useState([])
  const [adminComment, setAdminComment] = useState('')

  const [adminDayBookings, setAdminDayBookings] = useState([])

  const warnedRef = useRef(false)

  // disponibilidad
  useEffect(()=>{
    if(activeTab==='booking') fetchAvailability()
  },[selectedDate, court, activeTab])

  async function fetchAvailability(){
    try{
      const d = selectedDate.toISOString().slice(0,10)
      const res = await fetch(`${BACKEND_URL}/api/availability/${d}`)
      const data = await res.json()
      const busy = new Set(
        (data.slots || [])
          .filter(s=>!s.available && s.court_number===court)
          .map(s=>+s.time.split(':')[0])
      )
      setAvailability(busy)
    }catch{
      setMessage({type:'error', text:'No se cargó disponibilidad'})
    }
  }

  // mis reservas
  useEffect(()=>{
    if((activeTab==='myBookings' || activeTab==='booking') && (user || isAdmin)){
      fetchClientBookings()
    }
  }, [activeTab, user, isAdmin, selectedDate, court])
  async function fetchClientBookings(){
    try{
      const email = (user?.email) || ADMIN_EMAIL
      const res = await fetch(`${BACKEND_URL}/api/my-bookings/${encodeURIComponent(email)}`)
      if(res.ok){
        const raw = await res.json()
        setClientBookings(raw)
      }
    }catch{
      setMessage({type:'error', text:'Error al cargar tus reservas'})
    }
  }

  // admin: resumen del día
  useEffect(()=>{
    if(activeTab==='admin' && isAdmin){
      fetchAdminDayBookings()
    }
  }, [activeTab, isAdmin, selectedDate])
  async function fetchAdminDayBookings(){
    try{
      const d = selectedDate.toISOString().slice(0,10)
      const res = await fetch(`${BACKEND_URL}/api/bookings/day/${d}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      })
      if(res.ok){
        setAdminDayBookings(await res.json())
      }else{
        setAdminDayBookings([])
      }
    }catch{
      setAdminDayBookings([])
    }
  }

  // login
  async function handleLogin(e){
    e.preventDefault()
    // admin?
    try{
      const adminRes = await fetch(`${BACKEND_URL}/api/admin/login`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email:userForm.email, password:userForm.password })
      })
      if(adminRes.ok){
        const data = await adminRes.json()
        setIsAdmin(true)
        setAdminToken(data.access_token)
        setUser({ id:'admin', customer_name:'Administrador', email: data.email || userForm.email, phone:'000000000' })
        setMessage({type:'success', text:'Sesión de administrador iniciada'})
        clearSelectionAndToast()
        setActiveTab('booking')
        return
      }
    }catch{}
    // user normal
    try{
      const res = await fetch(`${BACKEND_URL}/api/users/login`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email:userForm.email, password:userForm.password })
      })
      if(res.ok){
        const u = await res.json()
        setUser(u); setIsAdmin(false); setAdminToken(null)
        setMessage({type:'success', text:'Bienvenido!'})
        clearSelectionAndToast()
        setActiveTab('booking')
      } else {
        const {detail} = await res.json()
        setMessage({type:'error', text: detail || 'Credenciales inválidas'})
      }
    }catch{
      setMessage({type:'error', text:'Error en login'})
    }
  }

  // signup
  async function handleSignup(e){
    e.preventDefault()
    if(userForm.email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase()){
      setMessage({type:'error', text:'Ese correo pertenece al administrador. Usa otro correo.'})
      return
    }
    try{
      const res = await fetch(`${BACKEND_URL}/api/users/register`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(userForm)
      })
      if(res.ok){
        const u = await res.json()
        setUser(u); setIsAdmin(false); setAdminToken(null)
        setMessage({type:'success', text:'Cuenta creada!'})
        clearSelectionAndToast()
        setActiveTab('booking')
      } else {
        const {detail} = await res.json()
        setMessage({type:'error', text: detail || 'No se pudo registrar'})
      }
    }catch{
      setMessage({type:'error', text:'Error al registrar'})
    }
  }

  function resetSelection(){
    setSelStart(null)
    setSelEnd(null)
    warnedRef.current = false
  }
  function clearSelectionAndToast(){
    resetSelection()
    setAdminComment('')
    setMessage(null)
  }
  useEffect(()=>{ setMessage(null) }, [selectedDate, court])

  // cuota: máx 2h por cancha/día
  async function checkClientQuota(hoursSelected){
    if(isAdmin || !user) return true
    const dateStr = selectedDate.toISOString().slice(0,10)
    await fetchClientBookings()
    const already = clientBookings.filter(
      b => b.booking_date === dateStr && b.court_number === court && b.status === 'confirmed'
    ).length
    if (already + hoursSelected > 2){
      setMessage({type:'error', text:'Límite de 2 horas por cancha y día (usuario).'})
      return false
    }
    return true
  }

  // selección
  function onCellMouseDown(h){
    if(availability.has(h)){
      setMessage({type:'error', text:'Ese horario ya está reservado en esta cancha.'})
      return
    }
    setMessage(null)
    setSelStart(h); setSelEnd(h+1); setDragging(true)
    warnedRef.current = false
  }
  function onCellMouseEnter(h){
    if(!dragging || selStart===null) return
    const nextEnd = Math.min(h+1, selStart+2)
    for(let x=selStart; x<nextEnd; x++){
      if(availability.has(x)){
        if(!warnedRef.current){
          setMessage({type:'error', text:'Una de las horas seleccionadas ya está ocupada.'})
          warnedRef.current = true
        }
        return
      }
    }
    setMessage(null)
    setSelEnd(nextEnd)
  }
  function onMouseUp(){
    if(!dragging) return
    setDragging(false)
    if(selStart===null || selEnd===null) return
    for(let x=selStart; x<selEnd; x++){
      if(availability.has(x)){
        setMessage({type:'error', text:'Una o más horas del rango ya están reservadas.'})
        return
      }
    }
    (async ()=>{
      const hours = selEnd - selStart
      const ok = await checkClientQuota(hours)
      if(ok) setShowConfirm(true)
      else resetSelection()
    })()
  }
  useEffect(()=>{
    window.addEventListener('mouseup', onMouseUp)
    return ()=>window.removeEventListener('mouseup', onMouseUp)
  }, [dragging, selStart, selEnd, availability])

  // Confirmar + (selector admin) + posible pago DEMO + crear reservas
  async function confirmBooking(e){
    e.preventDefault()
    setServerError('')
    setLoading(true)
    try{
      const dateStr = selectedDate.toISOString().slice(0,10)
      const hours = []
      for(let h=selStart; h<selEnd; h++){ hours.push(h) }

      if(!isAdmin){
        const ok = await checkClientQuota(hours.length)
        if(!ok){ setLoading(false); return }
      }

      // Cerrar el diálogo de confirmación ANTES de abrir overlays
      setShowConfirm(false)
      await new Promise(r => setTimeout(r, 0))

      // ¿Admin elige método?
      let adminMode = 'card'
      if(isAdmin){
        adminMode = await chooseAdminPaymentMode().catch(()=>{ throw new Error('cancelled') })
      }

      // Si público o admin con "pago con tarjeta" => flujo de pago
      let charge = null
      if(!isAdmin || adminMode === 'card'){
        const amountSoles = PRICE_PER_HOUR * hours.length
        const description = `Reserva Cancha ${court} | ${selStart}:00–${selEnd}:00 (${hours.length}h)`
        const metadata = {
          reservation_id: `tmp_${Date.now()}`,
          court,
          date: dateStr,
          start: `${selStart.toString().padStart(2,'0')}:00`,
          end:   `${selEnd.toString().padStart(2,'0')}:00`,
          user_id: user?.id || (isAdmin ? 'admin' : ''),
          customer_name: user?.customer_name || (isAdmin ? 'Administrador' : ''),
          note: isAdmin ? (adminComment || 'Admin') : '',
          admin_comment: isAdmin ? (adminComment || 'Admin') : ''
        }
        charge = await openDemoCheckout({
          amountSoles,
          email: (user?.email) || ADMIN_EMAIL,
          description,
          metadata
        }).catch((err)=>{ throw err })

        if(!charge || charge.status !== 'paid'){
          setLoading(false)
          setServerError('Pago cancelado o rechazado (demo).')
          return
        }
      }

      // Crear reservas (con voucher_url/charge_id si hubo pago) + payment_type si admin
      for(const h of hours){
        if(availability.has(h)){
          setServerError('Una de las horas ya no está disponible.')
          setLoading(false)
          return
        }
      }

      for(const h of hours){
        const payload = {
          customer_name: (user?.customer_name) || 'Administrador',
          email:         (user?.email)         || ADMIN_EMAIL,
          phone:         (user?.phone)         || '000000000',
          booking_date:  dateStr,
          start_time:    `${h.toString().padStart(2,'0')}:00`,
          court_number:  court,
          voucher_url:   charge?.voucher_url || null,
          charge_id:     charge?.id || null,
          ...(isAdmin && adminComment ? { admin_comment: adminComment } : {}),
          ...(isAdmin ? { payment_type: (adminMode === 'other' ? 'other' : 'card') } : {})
        }
        const res = await fetch(`${BACKEND_URL}/api/bookings`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify(payload)
        })
        if(!res.ok){
          const err = await res.json().catch(()=>({detail:'Error'}))
          throw new Error(err.detail || 'Error al reservar')
        }
      }

      // Abrir voucher PDF (siempre usamos fallback y pasamos comentario si es admin)
      const vurl = buildVoucherURL({
        charge,
        court,
        dateStr,
        startHH: selStart,
        endHH: selEnd,
        name: user?.customer_name || (isAdmin ? 'Administrador' : ''),
        email: user?.email || ADMIN_EMAIL,
        comment: isAdmin ? (adminComment || '') : ''
      })
      window.open(`${vurl}.pdf`, '_blank')

      setMessage({type:'success', text:`Reserva confirmada (${hours.length}h)${(isAdmin && adminMode==='other') ? ' (sin cobro)' : ' y pago demo exitoso!'}`})
      await fetchAvailability()
      await fetchClientBookings()
      clearSelectionAndToast()
      setActiveTab('myBookings')
    }catch(err){
      if(String(err.message||err) !== 'cancelled'){
        setServerError(String(err.message||err))
      }
    }finally{
      setLoading(false)
    }
  }

  function slotClasses({busy, sel}){
    if(busy) return 'bg-red-100 text-red-700 border border-red-200 cursor-not-allowed'
    if(sel)  return 'bg-emerald-600 text-white border border-emerald-600'
    return 'bg-white hover:bg-emerald-50 border'
  }

  function doLogout(){
    setUser(null); setIsAdmin(false); setAdminToken(null)
    clearSelectionAndToast()
    setActiveTab('home')
  }

  useEffect(()=>{
    if(activeTab==='booking') clearSelectionAndToast()
  }, [activeTab])

  const mergedMyBookings = mergeContiguous(
    clientBookings.filter(b => (user?.email || ADMIN_EMAIL) === b.email)
  )

  // Admin: etiquetas de ocupación (ahora incluye tipo de pago si es admin)
  const adminByHourByCourt = (() => {
    const map = new Map()
    for(const b of adminDayBookings){
      const h = hourFromHHMM(b.start_time)
      let label
      if (b.email.toLowerCase()===ADMIN_EMAIL.toLowerCase()){
        const base = (b.admin_comment || 'Admin')
        const pay  = (b.payment_type === 'other') ? 'Otro'
                    : (b.payment_type === 'card') ? 'Tarjeta'
                    : null
        label = pay ? `${base} · ${pay}` : base
      } else {
        label = (b.customer_name || b.email)
      }
      map.set(`${b.court_number}-${h}`, label)
    }
    return map
  })()

  return (
    <div className="min-h-screen bg-green-50 flex flex-col">
      {/* HEADER */}
      <header className="bg-white shadow p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold flex items-center">
          <Users className="mr-2 text-green-600"/> Tennis Booking
        </h1>
        {(user || isAdmin) && (
          <Button onClick={doLogout}>
            <LogOut className="mr-1"/> Logout
          </Button>
        )}
      </header>

      {/* TABS */}
      <main className="flex-grow p-6" onMouseUp={onMouseUp}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className={`grid ${isAdmin ? 'grid-cols-4' : 'grid-cols-3'} gap-2 mb-6`}>
            <TabsTrigger value="home">Home</TabsTrigger>
            <TabsTrigger value="booking"    disabled={!user && !isAdmin}>Reservar</TabsTrigger>
            <TabsTrigger value="myBookings"  disabled={!user && !isAdmin}>Mis Reservas</TabsTrigger>
            {isAdmin && <TabsTrigger value="admin">Admin</TabsTrigger>}
          </TabsList>

          {/* HOME */}
          <TabsContent value="home">
            <Card className="max-w-md mx-auto">
              <CardHeader><CardTitle>Bienvenido</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {!user && !isAdmin ? (
                  <>
                    {/* Iniciar sesión */}
                    <form onSubmit={handleLogin} className="space-y-3">
                      <Label>Email</Label>
                      <Input type="email" required value={userForm.email} onChange={e=>setUserForm({...userForm, email:e.target.value})}/>
                      <Label>Contraseña</Label>
                      <Input type="password" required value={userForm.password} onChange={e=>setUserForm({...userForm, password:e.target.value})}/>
                      <Button type="submit" className="w-full">Iniciar sesión</Button>
                    </form>

                    <Separator />

                    {/* Crear cuenta */}
                    <details className="mt-2">
                      <summary className="cursor-pointer">Crear cuenta</summary>
                      <div className="mt-3 space-y-3">
                        <form onSubmit={handleSignup} className="space-y-3">
                          <Label>Nombre</Label>
                          <Input required value={userForm.customer_name} onChange={e=>setUserForm({...userForm, customer_name:e.target.value})}/>
                          <Label>Email</Label>
                          <Input type="email" required value={userForm.email} onChange={e=>setUserForm({...userForm, email:e.target.value})}/>
                          <Label>Teléfono (9 dígitos)</Label>
                          <Input type="tel" required value={userForm.phone} onChange={e=>setUserForm({...userForm, phone:e.target.value})}/>
                          <Label>Contraseña</Label>
                          <Input type="password" required value={userForm.password} onChange={e=>setUserForm({...userForm, password:e.target.value})}/>
                          <Button type="submit" className="w-full">Registrarme</Button>
                        </form>
                      </div>
                    </details>
                  </>
                ) : (
                  <p className="text-center text-lg">¡Hola, {(user && user.customer_name) || 'Administrador'}!</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* RESERVAR */}
          <TabsContent value="booking">
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Calendario + cancha */}
              <Card>
                <CardHeader>
                  <CardTitle><CalendarDays className="mr-2 inline"/> Elige fecha y cancha</CardTitle>
                </CardHeader>
                <CardContent>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={d=>{ if(d){ setSelectedDate(d); setMessage(null) } }}
                    disabled={d=>d < new Date().setHours(0,0,0,0)}
                    className="w-full rounded border mb-4"
                  />
                  <Label>Cancha</Label>
                  <select className="block w-full p-2 border rounded" value={court} onChange={e=>{ setCourt(+e.target.value); setMessage(null) }}>
                    <option value={1}>Cancha 1</option>
                    <option value={2}>Cancha 2</option>
                    <option value={3}>Cancha 3</option>
                  </select>
                </CardContent>
              </Card>

              {/* Bloques horarios */}
              <Card>
                <CardHeader>
                  <CardTitle><Clock className="mr-2 inline"/> Selecciona hora (1–2h)</CardTitle>
                  <CardDescription>Arrastra para seleccionar 2 horas</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-rows-[repeat(16,_3rem)] gap-1 overflow-auto max-h-[480px]">
                    {HOURS.map(h=>{
                      const busy = availability.has(h)
                      const sel  = selStart!==null && h>=selStart && h<selEnd
                      return (
                        <div
                          key={h}
                          onMouseDown={()=>onCellMouseDown(h)}
                          onMouseEnter={()=>onCellMouseEnter(h)}
                          title={busy ? 'Ocupado' : 'Disponible'}
                          className={`h-12 flex items-center justify-center rounded select-none cursor-pointer ${slotClasses({busy, sel})}`}
                        >
                          {`${h}:00 – ${h+1}:00`}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* MIS RESERVAS */}
          <TabsContent value="myBookings">
            <Card>
              <CardHeader>
                <CardTitle>Mis Reservas</CardTitle>
                <CardDescription>Se agrupan bloques contiguos en uno solo</CardDescription>
              </CardHeader>
              <CardContent>
                {mergedMyBookings.length===0
                  ? <p>No tienes reservas.</p>
                  : <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Hora</TableHead>
                          <TableHead>Cancha</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Comentario</TableHead>
                          <TableHead>Voucher</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mergedMyBookings.map(b=>{
                          // URL del voucher con fallback (siempre)
                          const base = b.voucher_url
                            ? (b.voucher_url.startsWith('http') ? b.voucher_url : `${BACKEND_URL}${b.voucher_url}`)
                            : `${BACKEND_URL}/voucher/${b.charge_id || 'ch_mock_unknown'}`
                          const u = new URL(base)
                          u.searchParams.set('fallback','1')
                          u.searchParams.set('court', String(b.court_number))
                          u.searchParams.set('date',  b.booking_date)
                          u.searchParams.set('start', b.start_time)
                          u.searchParams.set('end',   b.end_time)
                          u.searchParams.set('name',  user?.customer_name || 'Cliente')
                          u.searchParams.set('email', user?.email || ADMIN_EMAIL)
                          if (b.admin_comment) u.searchParams.set('comment', b.admin_comment)
                          const pdfUrl = `${u.toString()}.pdf`

                          return (
                            <TableRow key={`${b.booking_date}-${b.court_number}-${b.start_time}`}>
                              <TableCell>{b.booking_date}</TableCell>
                              <TableCell>{b.start_time}–{b.end_time}</TableCell>
                              <TableCell>{b.court_number}</TableCell>
                              <TableCell>
                                {b.status==='confirmed'
                                  ? <CheckCircle className="inline mr-1 text-green-600"/>
                                  : <AlertCircle className="inline mr-1 text-red-600"/>}
                                {b.status}
                              </TableCell>
                              <TableCell>{b.admin_comment || '—'}</TableCell>
                              <TableCell>
                                <a href={pdfUrl} target="_blank" rel="noreferrer" download className="underline text-green-700" title="Abrir/Descargar PDF">PDF</a>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                }
              </CardContent>
            </Card>
          </TabsContent>

          {/* ADMIN (solo visible si isAdmin) */}
          {isAdmin && (
          <TabsContent value="admin">
            <Card>
              <CardHeader>
                <CardTitle>Resumen de ocupación (solo admin)</CardTitle>
                <CardDescription>Selecciona fecha y cancha</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid lg:grid-cols-2 gap-6">
                  <div>
                    <Label>Fecha</Label>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={d=>{ if(d){ setSelectedDate(d); setMessage(null) } }}
                      disabled={d=>d < new Date().setHours(0,0,0,0)}
                      className="w-full rounded border mb-4"
                    />
                    <Label>Cancha</Label>
                    <select className="block w-full p-2 border rounded" value={court} onChange={e=>{ setCourt(+e.target.value); setMessage(null) }}>
                      <option value={1}>Cancha 1</option>
                      <option value={2}>Cancha 2</option>
                      <option value={3}>Cancha 3</option>
                    </select>
                  </div>

                  <div>
                    <Label>Ocupación</Label>
                    <div className="grid grid-rows-[repeat(16,_3rem)] gap-1 overflow-auto max-h-[480px] mt-2">
                      {HOURS.map(h=>{
                        const label = adminByHourByCourt.get(`${court}-${h}`)
                        const busy  = !!label
                        return (
                          <div key={h} className={`h-12 flex items-center justify-between px-3 rounded border ${busy ? 'bg-red-100 border-red-200 text-red-700' : 'bg-white'}`}>
                            <span>{`${h}:00 – ${h+1}:00`}</span>
                            {busy && <span className="text-xs font-medium truncate max-w-[60%]">{label}</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          )}
        </Tabs>
      </main>

      {/* POPUP CONFIRMACIÓN */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Confirma tu reserva</DialogTitle></DialogHeader>
          {serverError && (
            <Alert variant="destructive"><AlertDescription>{serverError}</AlertDescription></Alert>
          )}
          <div className="space-y-2">
            <p><strong>Fecha:</strong> {selectedDate.toLocaleDateString()}</p>
            <p><strong>Cancha:</strong> {court}</p>
            <p><strong>Hora:</strong> {selStart}:00–{selEnd}:00 ({selEnd-selStart}h)</p>
            <p><strong>Total (demo):</strong> S/ {(PRICE_PER_HOUR * ((selEnd||0)-(selStart||0))).toFixed(2)}</p>

            {isAdmin && (
              <>
                <Separator />
                <Label>Comentario (solo admin)</Label>
                <textarea className="w-full p-2 border rounded" rows={3} value={adminComment} onChange={e=>setAdminComment(e.target.value)} placeholder="Motivo o nota de la reserva…"/>
              </>
            )}
          </div>
          <div className="mt-4 flex justify-end space-x-2">
            <Button variant="outline" onClick={()=>setShowConfirm(false)}>Cancelar</Button>
            <Button onClick={confirmBooking} disabled={loading}>
              {loading?'Procesando…':'Confirmar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* FOOTER */}
      <footer className="bg-gray-900 text-white py-12 mt-auto">
        <div className="max-w-7xl mx-auto text-center">
          <h3 className="text-2xl font-bold mb-4">Tennis Court Booking</h3>
          <p className="text-gray-400 mb-6">Premium courts • Easy booking • Flexible hours</p>
          <div className="flex justify-center space-x-8 text-sm">
            <span>📧 info@tenniscourt.com</span>
            <span>📞 (555) 123-4567</span>
            <span>📍 Tomas Marsano 2175, Surquillo</span>
          </div>
        </div>
      </footer>

      {/* TOAST */}
      {message && (
        <div className="fixed top-4 right-4 z-50">
          <Alert className={message.type==='success'?'border-green-500 bg-green-50':'border-red-500 bg-red-50'}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  )
}
