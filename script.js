const API_KEY = "c2f9cfdd2cb513c0f812f89130d91f2b";
const WEATHER_CACHE_TTL = 3 * 60 * 60 * 1000;
const IP_CACHE_TTL = 60 * 60 * 1000;
const DB_NAME = "WeatherDB";
const DB_VERSION = 1;
let db = null;
let pendingRequests = new Map();

const cityMap = {
    "москва": "Moscow", "санкт-петербург": "Saint Petersburg", "новосибирск": "Novosibirsk",
    "екатеринбург": "Yekaterinburg", "казань": "Kazan", "нижний новгород": "Nizhny Novgorod",
    "челябинск": "Chelyabinsk", "омск": "Omsk", "самара": "Samara", "ростов-на-дону": "Rostov-on-Don",
    "уфа": "Ufa", "красноярск": "Krasnoyarsk", "пермь": "Perm", "воронеж": "Voronezh",
    "волгоград": "Volgograd", "краснодар": "Krasnodar", "сочи": "Sochi", "владивосток": "Vladivostok"
};

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { db = request.result; resolve(db); };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("weather")) db.createObjectStore("weather", { keyPath: "city" });
            if (!db.objectStoreNames.contains("ipCity")) db.createObjectStore("ipCity", { keyPath: "id" });
        };
    });
}

async function getCachedWeather(city) {
    if (!db) await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction("weather", "readonly");
        const request = tx.objectStore("weather").get(city.toLowerCase());
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
    tx.onerror = () => {};
}

async function getCachedIPCity() {
    if (!db) await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction("ipCity", "readonly");
        const request = tx.objectStore("ipCity").get("ip");
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

async function getCityEngName(city) {
    const lower = city.toLowerCase().trim();
    if (cityMap[lower]) return cityMap[lower];
    if (!/[а-яё]/i.test(city)) return city;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
        const res = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${API_KEY}`, { signal: controller.signal });
        clearTimeout(timeout);
        const data = await res.json();
        return data[0]?.name || city;
    } catch { return city; }
}

async function fetchWeatherAndForecast(city) {
    const cityEng = await getCityEngName(city);
    const [weatherRes, forecastRes] = await Promise.all([
        fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cityEng)}&appid=${API_KEY}&units=metric&lang=ru`),
        fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(cityEng)}&appid=${API_KEY}&units=metric&lang=ru`)
    ]);
    const weather = await weatherRes.json();
    if (weather.cod !== 200) throw new Error(weather.message);
    const forecast = await forecastRes.json();
    return { weather, forecast: forecast.list };
}

async function getWeatherData(city) {
    const key = city.toLowerCase();
    if (pendingRequests.has(key)) return pendingRequests.get(key);
    const cached = await getCachedWeather(key);
    if (cached) return cached;
    const promise = fetchWeatherAndForecast(city).then(async (fresh) => {
        await setCachedWeather(key, fresh.weather, fresh.forecast);
        pendingRequests.delete(key);
        return fresh;
    }).catch((e) => { pendingRequests.delete(key); throw e; });
    pendingRequests.set(key, promise);
    return promise;
}

async function getCityByIP() {
    const cached = await getCachedIPCity();
    if (cached) return cached;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
        const res = await fetch("http://ip-api.com/json/", { signal: controller.signal });
        clearTimeout(timeout);
        const data = await res.json();
        if (data.status === "success" && data.city) {
            await setCachedIPCity(data.city);
            return data.city;
        }
    } catch {}
    return null;
}

let currentChart = null;

function formatDate(timestamp) {
    const d = new Date(timestamp * 1000);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}
function formatTime(timestamp) {
    const d = new Date(timestamp * 1000);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
function formatVisibility(meters) {
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} км` : `${meters} м`;
}
const weatherIcons = {
    "01d": "☀️", "01n": "🌙", "02d": "⛅", "02n": "☁️", "03d": "☁️", "03n": "☁️",
    "04d": "☁️", "04n": "☁️", "09d": "🌧️", "09n": "🌧️", "10d": "🌦️", "10n": "🌧️",
    "11d": "⛈️", "11n": "⛈️", "13d": "❄️", "13n": "❄️", "50d": "🌫️", "50n": "🌫️", "default": "🌡️"
};
function getWeatherIcon(code) { return weatherIcons[code] || weatherIcons.default; }
function getWeatherDescription(main) {
    const map = { "Clear": "Ясно", "Clouds": "Облачно", "Rain": "Дождь", "Snow": "Снег", "Thunderstorm": "Гроза", "Drizzle": "Морось", "Mist": "Туман", "Fog": "Туман" };
    return map[main] || main;
}
function getRecommendation(weather) {
    const temp = weather.main.temp, wind = weather.wind.speed;
    const rain = weather.weather[0].main === "Rain" || weather.weather[0].main === "Drizzle";
    const snow = weather.weather[0].main === "Snow";
    if (snow) return { text: "❄️ Снегопад! Обувайтесь теплее.", link: "https://www.ozon.ru/category/zimnyaya-obuv-14103/", linkText: "Купить зимнюю обувь" };
    if (rain) return { text: "☔ Идёт дождь. Не забудьте зонт!", link: "https://www.ozon.ru/category/zonty-15512/", linkText: "Выбрать зонт" };
    if (temp < -10) return { text: "🥶 Очень холодно! Надевайте тёплую шапку и пуховик.", link: "https://www.wildberries.ru/catalog/0/search.aspx?search=шапка+зимняя", linkText: "Купить шапку" };
    if (temp < 0) return { text: "🧣 Холодно! Наденьте шапку и шарф.", link: "https://www.ozon.ru/category/golovnye-ubory-15519/", linkText: "Выбрать шапку" };
    if (temp > 25) return { text: "☀️ Жарко! Пейте воду и носите головной убор.", link: "https://www.wildberries.ru/catalog/0/search.aspx?search=бутылка+для+воды", linkText: "Купить бутылку" };
    if (wind > 10) return { text: "💨 Сильный ветер! Возьмите ветровку.", link: "https://www.ozon.ru/category/kurtki-vetrovki-15511/", linkText: "Выбрать ветровку" };
    return { text: "🌡️ Погода комфортная. Хорошего дня!", link: null, linkText: null };
}
function renderHourlyChart(hourlyData, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const hours = hourlyData.map(item => new Date(item.dt * 1000).getHours() + ":00");
    const temps = hourlyData.map(item => Math.round(item.main.temp));
    if (currentChart) currentChart.destroy();
    currentChart = new Chart(canvas, {
        type: 'line',
        data: { labels: hours, datasets: [{ label: 'Температура (°C)', data: temps, borderColor: '#667eea', backgroundColor: 'rgba(102,126,234,0.1)', fill: true, tension: 0.3, pointBackgroundColor: '#667eea', pointBorderColor: '#fff', pointRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
    });
}
function displayDailyForecast(container, forecastList) {
    const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const daily = new Map();
    for (const item of forecastList) {
        const date = new Date(item.dt * 1000);
        const dayKey = date.toISOString().split('T')[0];
        if (!daily.has(dayKey)) daily.set(dayKey, { temps: [], icons: [] });
        const d = daily.get(dayKey);
        d.temps.push(item.main.temp);
        d.icons.push(item.weather[0].icon);
    }
    const dailyList = Array.from(daily.entries()).slice(0, 5).map(([key, val]) => {
        const avg = Math.round(val.temps.reduce((a,b)=>a+b,0)/val.temps.length);
        const min = Math.round(Math.min(...val.temps));
        const max = Math.round(Math.max(...val.temps));
        const icon = val.icons[Math.floor(val.icons.length/2)];
        return { date: key, avg, min, max, icon };
    });
    let html = '';
    for (const day of dailyList) {
        const date = new Date(day.date);
        const dayName = days[date.getDay()];
        const dayMonth = `${date.getDate()}.${date.getMonth()+1}`;
        html += `<div class="forecast-card"><div class="day">${dayName}</div><div class="date">${dayMonth}</div><div class="forecast-emoji">${getWeatherIcon(day.icon)}</div><div class="temp">${day.avg}°</div><div class="temp-range">${day.min}° / ${day.max}°</div></div>`;
    }
    container.innerHTML = html || '<div class="forecast-loading">Нет данных прогноза</div>';
}
function renderWeatherToContainer(weatherData, forecastList, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const rec = getRecommendation(weatherData);
    const hourlyData = forecastList.filter(item => item.dt > Math.floor(Date.now() / 1000)).slice(0, 24);
    const isFavorite = favorites.includes(weatherData.name);
    const favStar = isFavorite ? "★" : "⭐";
    const favClass = isFavorite ? "favorite-btn active" : "favorite-btn";
    const html = `
        <div class="city-header"><h2>${weatherData.name}</h2><div class="date-time">${formatDate(weatherData.dt)}</div><button class="${favClass}" data-city="${weatherData.name}"><span class="fav-star">${favStar}</span><span class="fav-text">${isFavorite ? "В избранном" : "В избранное"}</span></button></div>
        <div class="main-weather"><div class="temp-section"><div class="current-temp">${Math.round(weatherData.main.temp)}°C</div><div class="feels-like">Ощущается как ${Math.round(weatherData.main.feels_like)}°C</div></div><div class="weather-icon"><div class="weather-emoji">${getWeatherIcon(weatherData.weather[0].icon)}</div><div class="weather-description">${getWeatherDescription(weatherData.weather[0].main)}</div></div></div>
        <div class="details-grid"><div class="detail-card"><div class="detail-icon">💧</div><div class="detail-label">Влажность</div><div class="detail-value">${weatherData.main.humidity}%</div></div><div class="detail-card"><div class="detail-icon">🌡️</div><div class="detail-label">Давление</div><div class="detail-value">${Math.round(weatherData.main.pressure * 0.750062)} мм рт. ст.</div></div><div class="detail-card"><div class="detail-icon">💨</div><div class="detail-label">Ветер</div><div class="detail-value">${weatherData.wind.speed.toFixed(1)} м/с</div></div><div class="detail-card"><div class="detail-icon">👁️</div><div class="detail-label">Видимость</div><div class="detail-value">${formatVisibility(weatherData.visibility)}</div></div></div>
        <div class="sun-section"><div class="sun-item"><span class="sun-icon">🌅</span><span>Восход:</span><strong>${formatTime(weatherData.sys.sunrise)}</strong></div><div class="sun-item"><span class="sun-icon">🌇</span><span>Закат:</span><strong>${formatTime(weatherData.sys.sunset)}</strong></div></div>
        <div class="recommendation-section"><div class="recommendation-text">${rec.text}</div>${rec.link ? `<a href="${rec.link}" target="_blank" rel="noopener noreferrer" class="recommendation-link">${rec.linkText} →</a>` : ''}</div>
        <div class="hourly-section"><h4>⏰ Почасовой прогноз (24 часа)</h4><div class="hourly-chart-container"><canvas id="hourlyChart-${containerId}" width="400" height="200"></canvas></div></div>
        <div class="forecast-section"><h4>📅 Прогноз на 5 дней</h4><div class="forecast-cards" id="forecast-${containerId}"><div class="forecast-loading">Загрузка...</div></div></div>
    `;
    container.innerHTML = html;
    if (hourlyData.length) setTimeout(() => renderHourlyChart(hourlyData, `hourlyChart-${containerId}`), 30);
    else { const cc = container.querySelector('.hourly-chart-container'); if (cc) cc.innerHTML = '<p class="forecast-loading">Нет данных</p>'; }
    const fc = document.getElementById(`forecast-${containerId}`);
    if (fc) displayDailyForecast(fc, forecastList);
    const fav = container.querySelector('.favorite-btn');
    if (fav) fav.addEventListener('click', (e) => {
        e.stopPropagation();
        const city = fav.dataset.city;
        if (favorites.includes(city)) { removeFromFavorites(city); fav.classList.remove('active'); fav.querySelector('.fav-star').textContent = "⭐"; fav.querySelector('.fav-text').textContent = "В избранное"; }
        else { addToFavorites(city); fav.classList.add('active'); fav.querySelector('.fav-star').textContent = "★"; fav.querySelector('.fav-text').textContent = "В избранном"; }
        updateFavoritesList();
    });
}
let favorites = [];
function loadFavorites() { const s = localStorage.getItem('favorites'); favorites = s ? JSON.parse(s) : []; updateFavoritesList(); }
function saveFavorites() { localStorage.setItem('favorites', JSON.stringify(favorites)); }
function addToFavorites(city) { if (!favorites.includes(city)) { favorites.push(city); saveFavorites(); } }
function removeFromFavorites(city) { favorites = favorites.filter(c => c !== city); saveFavorites(); updateFavoritesList(); }
function updateFavoritesList() {
    const c = document.getElementById('favoritesList');
    if (!c) return;
    if (favorites.length === 0) { c.innerHTML = '<p class="favorites-empty">Нет избранных городов</p>'; return; }
    let html = '';
    for (const city of favorites) html += `<div class="favorite-item"><span class="favorite-name">${city}</span><button class="favorite-remove" data-city="${city}">✕</button></div>`;
    c.innerHTML = html;
    document.querySelectorAll('.favorite-item').forEach(el => {
        const city = el.querySelector('.favorite-name').innerText;
        el.addEventListener('click', (e) => { if (e.target.classList.contains('favorite-remove')) return; searchAndShowFull(city); });
        const rm = el.querySelector('.favorite-remove');
        if (rm) rm.addEventListener('click', (e) => { e.stopPropagation(); removeFromFavorites(city); });
    });
}
let searchTimeout = null;
async function loadLocationWeather() {
    const lc = document.getElementById("locationContent");
    lc.innerHTML = `<div class="loading-container"><div class="loading-spinner"></div><p>Определяем ваш город...</p></div>`;
    let city = await getCityByIP();
    if (!city) city = "Moscow";
    try { const { weather, forecast } = await getWeatherData(city); renderWeatherToContainer(weather, forecast, "locationContent"); }
    catch { lc.innerHTML = '<div class="loading-container"><p>Ошибка загрузки</p></div>'; }
}
async function searchAndShowFull(city) {
    const fc = document.getElementById("fullContent");
    fc.innerHTML = `<div class="loading-container"><div class="loading-spinner"></div><p>Поиск города ${city}...</p></div>`;
    try {
        const { weather, forecast } = await getWeatherData(city);
        document.getElementById("searchedCityTitle").textContent = `Погода в ${weather.name}`;
        renderWeatherToContainer(weather, forecast, "fullContent");
        document.getElementById("splitLayout").style.display = "none";
        document.getElementById("fullLayout").style.display = "block";
    } catch { fc.innerHTML = `<div class="loading-container"><p style="color:#e53e3e;">❌ Город "${city}" не найден</p><p style="margin-top:12px;">Проверьте название</p></div>`; }
}
function goBackToSplit() {
    document.getElementById("fullLayout").style.display = "none";
    document.getElementById("splitLayout").style.display = "grid";
    document.getElementById("cityInput").value = "";
}
function initTheme() {
    const s = localStorage.getItem('theme');
    if (s === 'dark') { document.body.classList.add('dark'); document.getElementById('themeToggle').textContent = '☀️'; }
    else { document.body.classList.remove('dark'); document.getElementById('themeToggle').textContent = '🌙'; }
}
function toggleTheme() {
    if (document.body.classList.contains('dark')) { document.body.classList.remove('dark'); localStorage.setItem('theme', 'light'); document.getElementById('themeToggle').textContent = '🌙'; }
    else { document.body.classList.add('dark'); localStorage.setItem('theme', 'dark'); document.getElementById('themeToggle').textContent = '☀️'; }
}
openDB().then(() => {
    loadFavorites();
    loadLocationWeather();
    initTheme();
    const searchBtn = document.getElementById("searchBtn");
    const cityInput = document.getElementById("cityInput");
    const backBtn = document.getElementById("backBtn");
    const themeBtn = document.getElementById("themeToggle");
    searchBtn.addEventListener("click", () => { const city = cityInput.value.trim(); if (city) searchAndShowFull(city); else alert("Введите город"); });
    cityInput.addEventListener("input", () => { if (searchTimeout) clearTimeout(searchTimeout); });
    cityInput.addEventListener("keypress", (e) => { if (e.key === "Enter") { const city = cityInput.value.trim(); if (city) searchAndShowFull(city); } });
    backBtn.addEventListener("click", goBackToSplit);
    themeBtn.addEventListener("click", toggleTheme);
}).catch(console.error);