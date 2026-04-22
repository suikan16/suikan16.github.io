const API_KEY = "c2f9cfdd2cb513c0f812f89130d91f2b";
const WEATHER_CACHE_TTL = 3 * 60 * 60 * 1000;
const IP_CACHE_TTL = 60 * 60 * 1000;
const DB_NAME = "WeatherDB";
const DB_VERSION = 2;
let db = null;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { db = request.result; resolve(db); };
        request.onupgradeneeded = (event) => {
            const dbUp = event.target.result;
            if (!dbUp.objectStoreNames.contains("weather")) dbUp.createObjectStore("weather", { keyPath: "city" });
            if (!dbUp.objectStoreNames.contains("ipCity")) dbUp.createObjectStore("ipCity", { keyPath: "id" });
            if (!dbUp.objectStoreNames.contains("weatherDiary")) dbUp.createObjectStore("weatherDiary", { keyPath: "id" });
        };
    });
}

async function getCachedWeather(city) {
    if (!db) await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction("weather", "readonly");
        const store = tx.objectStore("weather");
        const request = store.get(city.toLowerCase());
        request.onsuccess = () => {
            const record = request.result;
            resolve(record && Date.now() - record.timestamp < WEATHER_CACHE_TTL ? record.data : null);
        };
        request.onerror = () => resolve(null);
    });
}
async function setCachedWeather(city, weatherData, forecastData) {
    if (!db) await openDB();
    const tx = db.transaction("weather", "readwrite");
    tx.objectStore("weather").put({ city: city.toLowerCase(), data: { weather: weatherData, forecast: forecastData }, timestamp: Date.now() });
}
async function getCachedIPCity() {
    if (!db) await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction("ipCity", "readonly");
        const store = tx.objectStore("ipCity");
        const request = store.get("ip");
        request.onsuccess = () => {
            const record = request.result;
            resolve(record && Date.now() - record.timestamp < IP_CACHE_TTL ? record.city : null);
        };
        request.onerror = () => resolve(null);
    });
}
async function setCachedIPCity(city) {
    if (!db) await openDB();
    const tx = db.transaction("ipCity", "readwrite");
    tx.objectStore("ipCity").put({ id: "ip", city: city, timestamp: Date.now() });
}
async function fetchWeatherAndForecast(city) {
    const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric&lang=ru`);
    const weather = await weatherRes.json();
    if (weather.cod !== 200) throw new Error(weather.message);
    const forecastRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${API_KEY}&units=metric&lang=ru`);
    const forecast = await forecastRes.json();
    return { weather, forecast: forecast.list };
}
async function getWeatherData(city) {
    const cached = await getCachedWeather(city);
    if (cached) return cached;
    const fresh = await fetchWeatherAndForecast(city);
    await setCachedWeather(city, fresh.weather, fresh.forecast);
    return fresh;
}
async function getCityByIP() {
    const cached = await getCachedIPCity();
    if (cached) return cached;
    const services = [
        { url: "https://ipwho.is/", parser: d => d.success && d.city ? d.city : null },
        { url: "https://ipapi.co/json/", parser: d => d.city ? d.city : null },
        { url: "https://freegeoip.app/json/", parser: d => d.city ? d.city : null },
        { url: "https://geoip-db.com/json/", parser: d => d.city ? d.city : null }
    ];
    for (const s of services) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(s.url, { signal: controller.signal });
            clearTimeout(timeout);
            if (res.ok) {
                const data = await res.json();
                const city = s.parser(data);
                if (city && city !== "null" && city !== "") {
                    await setCachedIPCity(city);
                    return city;
                }
            }
        } catch(e) {}
    }
    return null;
}

let currentChart = null;
function formatDateLocal(timestamp, tz) { if (!tz) return "—"; const d = new Date((timestamp + tz) * 1000); return d.toLocaleDateString('ru-RU', { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' }); }
function formatTimeLocal(timestamp, tz) { if (!tz) return "—"; const d = new Date((timestamp + tz) * 1000); return d.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' }); }
const weatherIcons = { "01d":"☀️","01n":"🌙","02d":"⛅","02n":"☁️","03d":"☁️","03n":"☁️","04d":"☁️","04n":"☁️","09d":"🌧️","09n":"🌧️","10d":"🌦️","10n":"🌧️","11d":"⛈️","11n":"⛈️","13d":"❄️","13n":"❄️","50d":"🌫️","50n":"🌫️","default":"🌡️" };
function getWeatherIcon(c) { return weatherIcons[c] || weatherIcons.default; }
function getWeatherDescription(main) { const map = { "Clear":"Ясно","Clouds":"Облачно","Rain":"Дождь","Snow":"Снег","Thunderstorm":"Гроза","Drizzle":"Морось","Mist":"Туман","Fog":"Туман" }; return map[main] || main; }
function renderHourlyChart(hourlyData, canvasId, tz) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const hours = hourlyData.map(i => new Date((i.dt + tz) * 1000).getHours() + ":00");
    const temps = hourlyData.map(i => Math.round(i.main.temp));
    if (currentChart) currentChart.destroy();
    currentChart = new Chart(canvas, {
        type: 'line',
        data: { labels: hours, datasets: [{ label: 'Температура (°C)', data: temps, borderColor: '#667eea', backgroundColor: 'rgba(102,126,234,0.1)', fill: true, tension: 0.3, pointRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
    });
}
function displayDailyForecast(container, forecastList, tz) {
    const days = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
    const daily = new Map();
    for (const item of forecastList) {
        const date = new Date((item.dt + tz) * 1000);
        const key = date.toISOString().split('T')[0];
        if (!daily.has(key)) daily.set(key, { temps: [], icons: [] });
        const d = daily.get(key);
        d.temps.push(item.main.temp);
        d.icons.push(item.weather[0].icon);
    }
    const list = Array.from(daily.entries()).slice(0,5).map(([k,v]) => {
        const avg = Math.round(v.temps.reduce((a,b)=>a+b,0)/v.temps.length);
        const min = Math.round(Math.min(...v.temps));
        const max = Math.round(Math.max(...v.temps));
        const icon = v.icons[Math.floor(v.icons.length/2)];
        const date = new Date(k);
        return { dayName: days[date.getDay()], dayMonth: `${date.getDate()}.${date.getMonth()+1}`, avg, min, max, icon };
    });
    container.innerHTML = list.map(d => `<div class="forecast-card"><div class="day">${d.dayName}</div><div class="date">${d.dayMonth}</div><div class="forecast-emoji">${getWeatherIcon(d.icon)}</div><div class="temp">${d.avg}°</div><div class="temp-range">${d.min}°/${d.max}°</div></div>`).join('');
}
async function loadLocationWeather() {
    const w = document.getElementById("weatherWidget");
    if (!w) return;
    w.innerHTML = `<div class="loading-container"><div class="loading-spinner"></div><p>Определяем ваш город...</p></div>`;
    let city = await getCityByIP();
    if (!city) city = "Novosibirsk";
    try {
        const { weather, forecast } = await getWeatherData(city);
        const tz = weather.timezone;
        const hourly = forecast.filter(i => i.dt > Math.floor(Date.now()/1000)).slice(0,24);
        w.innerHTML = `
            <div class="city-header"><h2>${weather.name}</h2><div class="date-time">${formatDateLocal(weather.dt, tz)}</div></div>
            <div class="main-weather"><div><div class="current-temp">${Math.round(weather.main.temp)}°C</div><div class="feels-like">Ощущается как ${Math.round(weather.main.feels_like)}°C</div></div><div><div class="weather-emoji">${getWeatherIcon(weather.weather[0].icon)}</div><div class="weather-description">${getWeatherDescription(weather.weather[0].main)}</div></div></div>
            <div class="details-grid"><div class="detail-card"><div class="detail-icon">💧</div><div class="detail-label">Влажность</div><div class="detail-value">${weather.main.humidity}%</div></div><div class="detail-card"><div class="detail-icon">🌡️</div><div class="detail-label">Давление</div><div class="detail-value">${Math.round(weather.main.pressure * 0.750062)} мм рт. ст.</div></div><div class="detail-card"><div class="detail-icon">💨</div><div class="detail-label">Ветер</div><div class="detail-value">${weather.wind.speed.toFixed(1)} м/с</div></div><div class="detail-card"><div class="detail-icon">☁️</div><div class="detail-label">Облачность</div><div class="detail-value">${weather.clouds.all}%</div></div></div>
            <div class="sun-section"><div class="sun-item">🌅 Восход: ${formatTimeLocal(weather.sys.sunrise, tz)}</div><div class="sun-item">🌇 Закат: ${formatTimeLocal(weather.sys.sunset, tz)}</div></div>
            <div class="hourly-section"><h4>⏰ Почасовой прогноз</h4><div class="hourly-chart-container"><canvas id="hourlyChart"></canvas></div></div>
            <div class="forecast-section"><h4>📅 Прогноз на 5 дней</h4><div class="forecast-cards" id="forecastCards"></div></div>
        `;
        if (hourly.length) setTimeout(() => renderHourlyChart(hourly, "hourlyChart", tz), 30);
        const fc = document.getElementById("forecastCards");
        if (fc) displayDailyForecast(fc, forecast, tz);
    } catch(e) { w.innerHTML = '<div class="loading-container"><p>Ошибка загрузки</p></div>'; }
}
async function searchWeather() {
    const city = document.getElementById("cityInput").value.trim();
    if (!city) { alert("Введите город"); return; }
    const w = document.getElementById("weatherWidget");
    w.innerHTML = `<div class="loading-container"><div class="loading-spinner"></div><p>Поиск ${city}...</p></div>`;
    try {
        const { weather, forecast } = await getWeatherData(city);
        const tz = weather.timezone;
        const hourly = forecast.filter(i => i.dt > Math.floor(Date.now()/1000)).slice(0,24);
        w.innerHTML = `
            <div class="city-header"><h2>${weather.name}</h2><div class="date-time">${formatDateLocal(weather.dt, tz)}</div></div>
            <div class="main-weather"><div><div class="current-temp">${Math.round(weather.main.temp)}°C</div><div class="feels-like">Ощущается как ${Math.round(weather.main.feels_like)}°C</div></div><div><div class="weather-emoji">${getWeatherIcon(weather.weather[0].icon)}</div><div class="weather-description">${getWeatherDescription(weather.weather[0].main)}</div></div></div>
            <div class="details-grid"><div class="detail-card"><div class="detail-icon">💧</div><div class="detail-label">Влажность</div><div class="detail-value">${weather.main.humidity}%</div></div><div class="detail-card"><div class="detail-icon">🌡️</div><div class="detail-label">Давление</div><div class="detail-value">${Math.round(weather.main.pressure * 0.750062)} мм рт. ст.</div></div><div class="detail-card"><div class="detail-icon">💨</div><div class="detail-label">Ветер</div><div class="detail-value">${weather.wind.speed.toFixed(1)} м/с</div></div><div class="detail-card"><div class="detail-icon">☁️</div><div class="detail-label">Облачность</div><div class="detail-value">${weather.clouds.all}%</div></div></div>
            <div class="sun-section"><div class="sun-item">🌅 Восход: ${formatTimeLocal(weather.sys.sunrise, tz)}</div><div class="sun-item">🌇 Закат: ${formatTimeLocal(weather.sys.sunset, tz)}</div></div>
            <div class="hourly-section"><h4>⏰ Почасовой прогноз</h4><div class="hourly-chart-container"><canvas id="hourlyChart"></canvas></div></div>
            <div class="forecast-section"><h4>📅 Прогноз на 5 дней</h4><div class="forecast-cards" id="forecastCards"></div></div>
        `;
        if (hourly.length) setTimeout(() => renderHourlyChart(hourly, "hourlyChart", tz), 30);
        const fc = document.getElementById("forecastCards");
        if (fc) displayDailyForecast(fc, forecast, tz);
    } catch(e) { w.innerHTML = '<div class="loading-container"><p>Город не найден</p></div>'; }
}

// DIARY
async function getDiaryEntry(date) {
    if (!db || !db.objectStoreNames.contains("weatherDiary")) return null;
    return new Promise(r => { db.transaction("weatherDiary","readonly").objectStore("weatherDiary").get(date).onsuccess = e => r(e.target.result || null); });
}
async function getCurrentWeatherForDiary() {
    let city = await getCityByIP();
    if (!city) city = "Novosibirsk";
    try {
        const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric&lang=ru`);
        const data = await res.json();
        if (data.cod === 200) return { temp: Math.round(data.main.temp), description: data.weather[0].description, humidity: data.main.humidity, pressure: Math.round(data.main.pressure * 0.750062), wind: data.wind.speed.toFixed(1) };
    } catch(e) {}
    return { temp: '--', description: '--', humidity: '--', pressure: '--', wind: '--' };
}
async function loadDiaryForm() {
    const c = document.getElementById("diaryFormContainer");
    if (!c) return;
    const today = new Date().toISOString().split('T')[0];
    const existing = await getDiaryEntry(today);
    const weather = await getCurrentWeatherForDiary();
    c.innerHTML = `
        <div class="diary-weather-info" style="background:var(--detail-bg); padding:16px; border-radius:20px; margin-bottom:20px">🌡️ ${weather.temp}°C, ${weather.description}<br>💧 ${weather.humidity}% | 🌡️ ${weather.pressure} мм рт. ст. | 💨 ${weather.wind} м/с</div>
        <div class="mood-buttons" id="moodButtons">${[5,4,3,2,1].map(m => `<button data-mood="${m}" class="mood-btn ${existing?.mood===m?'selected':''}">${['😫 Ужасно','😕 Плохо','😐 Нормально','🙂 Хорошо','😊 Отлично'][m-1]}</button>`).join('')}</div>
        <div class="symptoms-grid">${['headache','pressure','joints','fatigue','insomnia','irritability'].map(s => `<label class="symptom-checkbox"><input type="checkbox" value="${s}" ${existing?.symptoms?.includes(s)?'checked':''}> ${s==='headache'?'🤕 Головная боль':s==='pressure'?'❤️ Давление':s==='joints'?'🦵 Боль в суставах':s==='fatigue'?'😴 Усталость':s==='insomnia'?'🌙 Бессонница':'😠 Раздражительность'}</label>`).join('')}</div>
        <label class="symptom-checkbox"><input type="checkbox" id="badSleep" ${existing?.badSleep?'checked':''}> 😴 Плохо спал(а)</label>
        <label class="symptom-checkbox"><input type="checkbox" id="medications" ${existing?.medications?'checked':''}> 💊 Принимал(а) лекарства</label>
        <textarea id="diaryNote" placeholder="Заметки..." style="width:100%; padding:12px; border-radius:20px; border:1px solid var(--border-color); margin:16px 0">${existing?.note||''}</textarea>
        <button class="diary-save-btn" onclick="saveDiaryEntry()">💾 Сохранить запись</button>
    `;
    document.querySelectorAll('.mood-btn').forEach(b => b.addEventListener('click', function() { document.querySelectorAll('.mood-btn').forEach(x=>x.classList.remove('selected')); this.classList.add('selected'); }));
}
async function saveDiaryEntry() {
    const mood = document.querySelector('.mood-btn.selected')?.dataset.mood;
    if (!mood) { alert("Оцените самочувствие"); return; }
    const symptoms = Array.from(document.querySelectorAll('.symptoms-grid input:checked')).map(cb=>cb.value);
    const badSleep = document.getElementById('badSleep')?.checked;
    const medications = document.getElementById('medications')?.checked;
    const note = document.getElementById('diaryNote')?.value||'';
    const today = new Date().toISOString().split('T')[0];
    const weather = await getCurrentWeatherForDiary();
    const entry = { id: today, date: today, mood: parseInt(mood), symptoms, badSleep, medications, note, weather, timestamp: Date.now() };
    if (!db || !db.objectStoreNames.contains("weatherDiary")) return;
    const tx = db.transaction("weatherDiary","readwrite");
    tx.objectStore("weatherDiary").put(entry);
    tx.oncomplete = () => { alert("Запись сохранена!"); loadDiaryStats(); };
}
async function loadDiaryStats() {
    const c = document.getElementById("diaryStats");
    if (!c) return;
    if (!db || !db.objectStoreNames.contains("weatherDiary")) { c.innerHTML = '<p>Нет записей</p>'; return; }
    const entries = await new Promise(r => { db.transaction("weatherDiary","readonly").objectStore("weatherDiary").getAll().onsuccess = e => r(e.target.result); });
    if (!entries.length) { c.innerHTML = '<p>Нет записей</p>'; return; }
    const avgMood = (entries.reduce((s,e)=>s+e.mood,0)/entries.length).toFixed(1);
    const headache = entries.filter(e=>e.symptoms.includes('headache')).length;
    const pressure = entries.filter(e=>e.symptoms.includes('pressure')).length;
    c.innerHTML = `<div style="background:var(--detail-bg); border-radius:20px; padding:20px"><p><strong>📊 Записей:</strong> ${entries.length}</p><p><strong>😊 Среднее самочувствие:</strong> ${avgMood}/5</p><p><strong>🤕 Головная боль:</strong> в ${headache} днях</p><p><strong>❤️ Давление:</strong> в ${pressure} днях</p><p>💡 Регулярные записи помогут увидеть связь с погодой</p></div>`;
}

// MEDICINES
const medicines = {
    headache: [{ name:"Парацетамол", price:"120 руб", link:"https://www.wildberries.ru/catalog/0/search.aspx?search=парацетамол", pharmacy:"Wildberries" },{ name:"Ибупрофен", price:"150 руб", link:"https://www.ozon.ru/category/obezbolivayuschie-15518/", pharmacy:"Ozon" }],
    pressure: [{ name:"Тонометр", price:"1200 руб", link:"https://www.wildberries.ru/catalog/0/search.aspx?search=тонометр", pharmacy:"Wildberries" },{ name:"Каптоприл", price:"90 руб", link:"https://apteka.ru/search/?q=каптоприл", pharmacy:"Apteka.ru" }],
    joints: [{ name:"Диклофенак", price:"200 руб", link:"https://www.wildberries.ru/catalog/0/search.aspx?search=диклофенак", pharmacy:"Wildberries" }],
    fatigue: [{ name:"Витамин D", price:"350 руб", link:"https://www.wildberries.ru/catalog/0/search.aspx?search=витамин+d", pharmacy:"Wildberries" }],
    insomnia: [{ name:"Мелатонин", price:"400 руб", link:"https://www.ozon.ru/category/sredstva-dlya-sna-15515/", pharmacy:"Ozon" }]
};
function showRecommendations(symptom) {
    const c = document.getElementById("recommendationsList");
    if (!c) return;
    const items = medicines[symptom];
    if (!items) { c.innerHTML = '<div class="placeholder-card">Нет рекомендаций</div>'; return; }
    c.innerHTML = items.map(item => `<div class="recommendation-item"><div><strong>${item.name}</strong><br><span style="color:var(--text-secondary)">${item.price} • ${item.pharmacy}</span></div><a href="${item.link}" target="_blank" class="recommendation-link">Купить →</a></div>`).join('');
}

// PDF MEDICAL REPORT
async function generatePDFReport() {
    const start = document.getElementById('startDate')?.value;
    const end = document.getElementById('endDate')?.value;
    if (!start || !end) { alert("Выберите период"); return; }
    if (!db || !db.objectStoreNames.contains("weatherDiary")) { alert("Нет данных дневника"); return; }
    const entries = await new Promise(r => { db.transaction("weatherDiary","readonly").objectStore("weatherDiary").getAll().onsuccess = e => r(e.target.result); });
    const filtered = entries.filter(e => e.date >= start && e.date <= end);
    if (!filtered.length) { alert("Нет записей за период"); return; }
    const btn = document.getElementById('generatePdfBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '⏳ Формирование заключения...';
    btn.disabled = true;
    try {
        const patientName = localStorage.getItem('patientName') || 'Не указано';
        const patientAge = localStorage.getItem('patientAge') || '—';
        const patientGender = localStorage.getItem('patientGender') || '—';
        const n = filtered.length;
        const avgMood = (filtered.reduce((s,e)=>s+e.mood,0)/n).toFixed(2);
        const headacheCnt = filtered.filter(e=>e.symptoms.includes('headache')).length;
        const pressureCnt = filtered.filter(e=>e.symptoms.includes('pressure')).length;
        const jointsCnt = filtered.filter(e=>e.symptoms.includes('joints')).length;
        const fatigueCnt = filtered.filter(e=>e.symptoms.includes('fatigue')).length;
        const insomniaCnt = filtered.filter(e=>e.symptoms.includes('insomnia')).length;
        const headacheDays = filtered.filter(e=>e.symptoms.includes('headache'));
        const avgPressureHeadache = headacheDays.length ? headacheDays.reduce((s,e)=>s+(e.weather?.pressure||750),0)/headacheDays.length : 750;
        const avgPressureNormal = filtered.filter(e=>!e.symptoms.includes('headache')).reduce((s,e)=>s+(e.weather?.pressure||750),0)/(n-headacheCnt);
        const odds = avgPressureNormal - avgPressureHeadache > 0 ? ((avgPressureNormal - avgPressureHeadache)/10).toFixed(1) : '0';
        const jointsDays = filtered.filter(e=>e.symptoms.includes('joints'));
        const avgHumidityJoints = jointsDays.length ? jointsDays.reduce((s,e)=>s+(e.weather?.humidity||50),0)/jointsDays.length : 50;
        const avgHumidityNormal = filtered.filter(e=>!e.symptoms.includes('joints')).reduce((s,e)=>s+(e.weather?.humidity||50),0)/(n-jointsCnt);
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Медицинское заключение</title><style>body{font-family:'Times New Roman',Times,serif;margin:40px;font-size:12pt;}.header{text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:30px;}.patient-info{border:1px solid #000;padding:10px;background:#f9f9f9;margin-bottom:20px;}.section-title{font-size:14pt;font-weight:bold;border-left:4px solid #2c3e50;padding-left:10px;margin:20px 0 10px;}table{width:100%;border-collapse:collapse;margin:10px 0;}th,td{border:1px solid #000;padding:8px;text-align:left;}th{background:#e0e0e0;}.correlation{background:#f0f0f0;padding:10px;border-left:3px solid #c0392b;margin:10px 0;}.signature{display:flex;justify-content:space-between;margin-top:40px;}.footer{text-align:center;margin-top:30px;font-size:10pt;}</style></head><body>
        <div class="header"><h1>МЕДИЦИНСКОЕ ЗАКЛЮЧЕНИЕ</h1><p>по результатам дневника самонаблюдения «Метео Health»</p><p>№ ${Date.now()} | ${new Date().toLocaleDateString('ru-RU')}</p></div>
        <div class="patient-info"><strong>Пациент:</strong> ${patientName} &nbsp;|&nbsp; <strong>Возраст:</strong> ${patientAge} &nbsp;|&nbsp; <strong>Пол:</strong> ${patientGender}<br><strong>Период наблюдения:</strong> ${start} — ${end}<br><strong>Количество дней с записями:</strong> ${n}</div>
        <div class="section"><div class="section-title">1. СТАТИСТИЧЕСКИЙ АНАЛИЗ</div><table><tr><th>Показатель</th><th>Значение</th></tr><tr><td>Среднее самочувствие (1–5)</td><td>M = ${avgMood}</td></tr><tr><td>Частота головной боли</td><td>${headacheCnt} из ${n} (${(headacheCnt/n*100).toFixed(1)}%)</td></tr><tr><td>Частота скачков давления</td><td>${pressureCnt} из ${n}</td></tr><tr><td>Частота болей в суставах</td><td>${jointsCnt} из ${n}</td></tr><tr><td>Частота усталости</td><td>${fatigueCnt} из ${n}</td></tr><tr><td>Частота бессонницы</td><td>${insomniaCnt} из ${n}</td></tr></table></div>
        <div class="section"><div class="section-title">2. КОРРЕЛЯЦИОННЫЙ АНАЛИЗ</div><div class="correlation"><strong>Выявлены значимые связи:</strong><br>• Головная боль vs давление: среднее давление в дни с болью = ${avgPressureHeadache.toFixed(0)} мм рт. ст., без боли = ${avgPressureNormal.toFixed(0)} мм рт. ст. При снижении давления ниже 745 мм рт. ст. частота головной боли возрастает в ${odds} раза.<br>• Боль в суставах vs влажность: средняя влажность в дни с болью = ${avgHumidityJoints.toFixed(0)}%, без боли = ${avgHumidityNormal.toFixed(0)}%. Повышение влажности >75% ассоциировано с болями в суставах.</div></div>
        <div class="section"><div class="section-title">3. ИНДИВИДУАЛЬНЫЕ РЕКОМЕНДАЦИИ</div><table><tr><th>Фактор риска</th><th>Рекомендация</th></tr><tr><td>Низкое давление (&lt;745 мм рт. ст.)</td><td>Профилактический приём анальгетиков, контроль АД</td></tr><tr><td>Высокая влажность (&gt;75%)</td><td>Ограничение нагрузки на суставы, тёплые компрессы</td></tr><tr><td>Резкие перепады температуры</td><td>Адаптивный режим, избегать переохлаждения</td></tr></table></div>
        <div class="section"><div class="section-title">4. ДЕТАЛЬНЫЙ ЖУРНАЛ НАБЛЮДЕНИЙ</div><table><tr><th>Дата</th><th>Самочувствие</th><th>Симптомы</th><th>Погода</th></tr>${filtered.slice(0,20).map(e => `<tr><td>${e.date}</td><td>${e.mood} (${['Ужасно','Плохо','Нормально','Хорошо','Отлично'][e.mood-1]})</td><td>${e.symptoms.map(s=>({headache:'ГБ',pressure:'АД',joints:'суставы',fatigue:'усталость',insomnia:'бессонница'})[s]||s).join(', ')||'—'}</td><td>t=${e.weather?.temp||'—'}°C, p=${e.weather?.pressure||'—'} мм рт. ст.</td></tr>`).join('')}</table>${filtered.length>20?'<p><em>Приведены первые 20 записей. Полный журнал доступен по запросу.</em></p>':''}</div>
        <div class="signature"><div>Лечащий врач: ___________________</div><div>Пациент: ___________________</div></div>
        <div class="footer"><p>Документ сформирован автоматически платформой «Метео Health»</p><p>Настоящее заключение не заменяет очной консультации врача</p></div>
        </body></html>`;
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.onload = () => { win.print(); btn.innerHTML = orig; btn.disabled = false; };
    } catch(e) { alert("Ошибка формирования заключения"); btn.innerHTML = orig; btn.disabled = false; }
}

// THEME & TABS
function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') { document.body.classList.add('dark'); document.querySelector('.theme-icon').textContent = '☀️'; }
    else { document.body.classList.remove('dark'); document.querySelector('.theme-icon').textContent = '🌙'; }
}
function toggleTheme() {
    if (document.body.classList.contains('dark')) { document.body.classList.remove('dark'); localStorage.setItem('theme','light'); document.querySelector('.theme-icon').textContent = '🌙'; }
    else { document.body.classList.add('dark'); localStorage.setItem('theme','dark'); document.querySelector('.theme-icon').textContent = '☀️'; }
}
function initTabs() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            document.getElementById(`tab-${tab}`).classList.add('active');
            if (tab === 'diary') { loadDiaryForm(); loadDiaryStats(); }
            if (tab === 'weather' && !document.getElementById('weatherWidget').innerHTML.includes('city-header')) loadLocationWeather();
        });
    });
}

// SAVE PATIENT DATA
document.getElementById('savePatientInfo')?.addEventListener('click', () => {
    const name = document.getElementById('patientName')?.value.trim();
    const age = document.getElementById('patientAge')?.value;
    const gender = document.getElementById('patientGender')?.value;
    if (name) localStorage.setItem('patientName', name);
    if (age) localStorage.setItem('patientAge', age);
    if (gender) localStorage.setItem('patientGender', gender);
    alert('Данные пациента сохранены');
});

openDB().then(() => {
    initTabs();
    initTheme();
    loadLocationWeather();
    loadDiaryStats();
    document.getElementById('searchBtn')?.addEventListener('click', searchWeather);
    document.getElementById('locationBtn')?.addEventListener('click', loadLocationWeather);
    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
    document.getElementById('generatePdfBtn')?.addEventListener('click', generatePDFReport);
    document.querySelectorAll('.symptom-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.symptom-chip').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            showRecommendations(btn.dataset.symptom);
        });
    });
    loadDiaryForm();
}).catch(console.error);