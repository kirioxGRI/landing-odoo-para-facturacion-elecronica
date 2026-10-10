/* Kiriox · Landing e-CF — comportamiento de la página (sin dependencias) */
(function () {
  'use strict';

  /* ===== Configuración ===== */
  var WHATSAPP = '18296389999';                                  // número que recibe las solicitudes del formulario
  var DEADLINE = new Date('2026-11-15T00:00:00-04:00').getTime(); // fecha límite DGII (hora de RD)

  // Solo solicitudes REALES. Formato 'AAAA-MM-DD Ciudad'. Se muestran las de los últimos 30 días.
  // Ejemplo: ['2026-10-09 Santiago', '2026-10-10 Santo Domingo']
  var SOLICITUDES_REALES = [];

  // Opcional: URL que recibe cada solicitud en JSON (un Cloudflare Worker, Make, n8n, Odoo...).
  // Así no pierdes al prospecto que abre WhatsApp pero no pulsa "enviar". Vacío = desactivado.
  var LEAD_WEBHOOK = '';

  /* ===== Utilidades ===== */
  var DAY = 86400000;
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function store(key, val) {
    try {
      if (val === undefined) return sessionStorage.getItem(key);
      sessionStorage.setItem(key, val);
    } catch (e) { return null; }
  }
  function replay(el) { el.hidden = true; void el.offsetWidth; el.hidden = false; }

  /* ===== Contador en vivo ===== */
  var big = $('#dl-big'), small = $('#dl-small'), clock = $('#dl-clock');
  function daysLeft() { return Math.max(0, Math.floor((DEADLINE - Date.now()) / DAY)); }
  function tick() {
    if (!big) return;
    var ms = DEADLINE - Date.now();
    if (ms <= 0) {
      big.textContent = 'Vencido';
      big.style.color = '#B42318';
      small.textContent = 'cada día sin e-CF suma riesgo';
      clock.textContent = '';
      return;
    }
    var d = Math.floor(ms / DAY);
    big.textContent = d;
    small.textContent = d === 1 ? 'día' : 'días';
    clock.textContent = 'y ' + pad(Math.floor(ms / 3600000) % 24) + ' h ' +
      pad(Math.floor(ms / 60000) % 60) + ' min ' + pad(Math.floor(ms / 1000) % 60) + ' s';
  }
  tick();
  setInterval(tick, 1000);

  /* ===== Ventana del formulario ===== */
  var modal = $('#lead-modal');
  var lastFocus = null;
  function openForm() {
    if (!modal) return;
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    hideToast();
    var first = $('input', modal);
    if (first) first.focus();
  }
  function closeForm() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $all('[data-open-form]').forEach(function (b) { b.addEventListener('click', openForm); });
  $all('[data-close-form]').forEach(function (b) { b.addEventListener('click', closeForm); });
  if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) closeForm(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeForm(); });

  /* ===== Formularios → WhatsApp ===== */
  function readForm(form) {
    var get = function (n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
    return { nombre: get('nombre'), empresa: get('empresa'), contacto: get('contacto') };
  }
  function validate(form, data) {
    var ok = {
      nombre: data.nombre.length >= 2,
      empresa: data.empresa.length >= 2,
      contacto: data.contacto.replace(/\s/g, '').length >= 7
    };
    var firstBad = null;
    Object.keys(ok).forEach(function (k) {
      var err = form.querySelector('[data-err="' + k + '"]');
      var input = form.querySelector('[name="' + k + '"]');
      if (err) err.hidden = ok[k];
      if (input) {
        input.setAttribute('aria-invalid', ok[k] ? 'false' : 'true');
        input.style.borderColor = ok[k] ? '#C9C8D6' : '#B42318';
        if (!ok[k] && !firstBad) firstBad = input;
      }
    });
    if (firstBad) firstBad.focus();
    return !firstBad;
  }
  function waUrl(data) {
    var msg = 'Hola Kiriox, quiero mi diagnóstico de facturación electrónica (e-CF).' +
      '\nNombre: ' + data.nombre + '\nEmpresa: ' + data.empresa + '\nContacto: ' + data.contacto;
    return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(msg);
  }
  function notify(data) {
    var payload = JSON.stringify({
      nombre: data.nombre, empresa: data.empresa, contacto: data.contacto,
      origen: location.href, fecha: new Date().toISOString()
    });
    if (LEAD_WEBHOOK) {
      try {
        if (!(navigator.sendBeacon && navigator.sendBeacon(LEAD_WEBHOOK, new Blob([payload], { type: 'application/json' })))) {
          fetch(LEAD_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function () {});
        }
      } catch (e) {}
    }
    // Evento para analítica (Google Tag Manager, Meta Pixel, etc.)
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'solicitud_diagnostico_ecf' });
      if (typeof window.fbq === 'function') window.fbq('track', 'Lead');
    } catch (e) {}
  }
  function showSent(form) {
    var sent = form.querySelector('[data-sent]');
    if (sent) replay(sent);
  }
  $all('[data-lead-form]').forEach(function (form) {
    var send = form.querySelector('[data-send]');
    $all('input', form).forEach(function (input) {
      input.addEventListener('input', function () {
        var err = form.querySelector('[data-err="' + input.name + '"]');
        if (err && !err.hidden) validate(form, readForm(form));
      });
    });
    if (send) {
      send.addEventListener('click', function (e) {
        var data = readForm(form);
        if (!validate(form, data)) { e.preventDefault(); return; }
        send.href = waUrl(data);   // el navegador abre este enlace en otra pestaña
        notify(data);
        showSent(form);
      });
    }
    form.addEventListener('submit', function (e) {   // Enter dentro de un campo
      e.preventDefault();
      var data = readForm(form);
      if (!validate(form, data)) return;
      notify(data);
      var url = waUrl(data);
      var win = window.open(url, '_blank', 'noopener');
      if (!win) location.href = url;
      showSent(form);
    });
  });

  /* ===== Aviso emergente: solo hechos ciertos y solicitudes reales ===== */
  var toast = $('#toast');
  var tLabel = $('#toast-label'), tWhen = $('#toast-when'), tText = $('#toast-text'), tBurst = $('#toast-burst');

  function buildToasts() {
    var list = [];
    var now = Date.now();
    SOLICITUDES_REALES.forEach(function (line) {
      var m = String(line).trim().match(/^(\d{4}-\d{2}-\d{2})\s*[·,\-–]?\s*(.*)$/);
      if (!m) return;
      var age = Math.floor((now - new Date(m[1] + 'T12:00:00-04:00').getTime()) / DAY);
      if (age < 0 || age > 30) return;
      var city = m[2].trim();
      list.push({
        label: 'Diagnóstico solicitado',
        when: age === 0 ? 'Hoy' : (age === 1 ? 'Ayer' : 'Hace ' + age + ' días'),
        text: 'Un cliente' + (city ? ' de ' + city : '') + ' ha pedido un diagnóstico con nosotros.',
        celebrate: true
      });
    });
    var d = daysLeft();
    list.push(d > 0
      ? { label: 'Plazo DGII', text: 'Faltan ' + d + (d === 1 ? ' día' : ' días') + ' para el 15 de noviembre, fecha límite de la DGII para pequeños y medianos.' }
      : { label: 'Plazo DGII', text: 'La prórroga de la DGII terminó el 15 de noviembre. Facturar sin e-CF ya es una infracción.' });
    list.push({ label: 'Diagnóstico', text: 'En 30 minutos sales con tu fecha límite real y un plan para cumplir.' });
    return list;
  }

  var idx = 0, hideTimer = null;
  function hideToast() {
    if (toast) toast.hidden = true;
    clearTimeout(hideTimer);
  }
  function showToast() {
    if (!toast || store('kx-toast-off') === '1' || (modal && !modal.hidden)) return;
    var list = buildToasts();
    var t = list[idx % list.length];
    idx++;
    tLabel.textContent = t.label;
    tText.textContent = t.text;
    tWhen.textContent = t.when || '';
    tWhen.hidden = !t.when;
    tBurst.hidden = !t.celebrate;
    replay(toast);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideToast, 7000);
  }
  var closeBtn = $('[data-close-toast]');
  if (closeBtn) closeBtn.addEventListener('click', function () { hideToast(); store('kx-toast-off', '1'); });
  setTimeout(function () { showToast(); setInterval(showToast, 18000); }, 6000);
})();
