'use strict';

// ── DOM refs ─────────────────────────────────────────────────────────────────
const headacheSlider = document.getElementById('headache');
const fatigueSlider  = document.getElementById('fatigue');
const headacheValue  = document.getElementById('headacheValue');
const fatigueValue   = document.getElementById('fatigueValue');
const submitBtn      = document.getElementById('submitBtn');
const btnText        = document.getElementById('btnText');
const btnLoader      = document.getElementById('btnLoader');

const inputCard  = document.getElementById('inputCard');
const resultCard = document.getElementById('resultCard');
const errorCard  = document.getElementById('errorCard');

// ── Slider gradient fill ──────────────────────────────────────────────────────
function setSliderFill(slider, fillColor) {
  const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.background =
    `linear-gradient(to right, ${fillColor} ${pct}%, #e5e7eb ${pct}%)`;
}

// ── Slider event wiring ───────────────────────────────────────────────────────
headacheSlider.addEventListener('input', () => {
  headacheValue.textContent = headacheSlider.value;
  setSliderFill(headacheSlider, '#dc2626');
});

fatigueSlider.addEventListener('input', () => {
  fatigueValue.textContent = fatigueSlider.value;
  setSliderFill(fatigueSlider, '#1b06d9');
});

// Initialise fills on load
setSliderFill(headacheSlider, '#911212');
setSliderFill(fatigueSlider,  '#2606d9');

// ── Geolocation helper ────────────────────────────────────────────────────────
function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error('A böngésződ nem támogatja a helyzet meghatározást.'));
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      const msgs = {
        [err.PERMISSION_DENIED]:    'Lokáció hozzáférés megtagadva. Engedélyezd a böngésző beállításaiban!',
        [err.POSITION_UNAVAILABLE]: 'Helyzet nem elérhető. Próbáld újra!',
        [err.TIMEOUT]:              'Helyzet lekérés időtúllépés. Próbáld újra!',
      };
      reject(new Error(msgs[err.code] || 'Ismeretlen helymeghatározási hiba.'));
    }, { timeout: 10000, maximumAge: 60000 });
  });
}

// ── Loading state ─────────────────────────────────────────────────────────────
function setLoading(loading) {
  submitBtn.disabled = loading;
  btnText.classList.toggle('hidden', loading);
  btnLoader.classList.toggle('hidden', !loading);
}

// ── Show result ───────────────────────────────────────────────────────────────
const RESULT_ICONS = { none: '😌', few: '🌤️', some: '⛅', many: '🌩️' };

function showResult(data) {
  document.getElementById('resultCount').textContent   = data.count;
  document.getElementById('resultMessage').textContent = data.message;
  document.getElementById('resultMeta').textContent    =
    `Keresési sugár: ${data.radius} km · utolsó 24 óra`;
  document.getElementById('resultIcon').textContent    =
    RESULT_ICONS[data.category] || '🌍';

  resultCard.className = `card result-card ${data.category}`;

  inputCard.classList.add('hidden');
  resultCard.classList.remove('hidden');
}

// ── Show error ────────────────────────────────────────────────────────────────
function showError(message) {
  document.getElementById('errorMessage').textContent = message;
  inputCard.classList.add('hidden');
  errorCard.classList.remove('hidden');
}

// ── Submit handler ────────────────────────────────────────────────────────────
submitBtn.addEventListener('click', async () => {
  setLoading(true);

  let position;
  try {
    position = await getLocation();
  } catch (err) {
    setLoading(false);
    showError(err.message);
    return;
  }

  const payload = {
    latitude:  position.coords.latitude,
    longitude: position.coords.longitude,
    headache:  Number(headacheSlider.value),
    fatigue:   Number(fatigueSlider.value),
  };

  try {
    const response = await fetch('/api/symptoms', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Szerverhiba – próbáld újra!');
    }

    const data = await response.json();
    setLoading(false);
    showResult(data);
  } catch (err) {
    setLoading(false);
    showError(err.message || 'Hiba történt a beküldés során.');
  }
});

// ── Back buttons ──────────────────────────────────────────────────────────────
document.getElementById('backBtn').addEventListener('click', () => {
  resultCard.classList.add('hidden');
  inputCard.classList.remove('hidden');
});

document.getElementById('errorBackBtn').addEventListener('click', () => {
  errorCard.classList.add('hidden');
  inputCard.classList.remove('hidden');
});
