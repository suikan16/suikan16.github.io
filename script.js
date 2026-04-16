const API_KEY = "c2f9cfdd2cb513c0f812f89130d91f2b";
const WEATHER_CACHE_TTL = 3 * 60 * 60 * 1000;
const IP_CACHE_TTL = 60 * 60 * 1000;
const DB_NAME = "WeatherDB";
const DB_VERSION = 1;
let db = null;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("weather")) {
                db.createObjectStore("weather", { keyPath: "city" });
            }
            if (!db.objectStoreNames.contains("ipCity")) {
                db.createObjectStore("ipCity", { keyPath: "id" });
            }
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
            if (record && Date.now() - record.timestamp < WEATHER_CACHE_TTL) {
                resolve(record.data);
            } else {
                resolve(null);
            }
        };
        request.onerror = () => resolve(null);
    });
}

async function setCachedWeather(city, weatherData, forecastData) {
    if (!db) await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction("weather", "readwrite");
        const store = tx.objectStore("weather");
        store.put({
            city: city.toLowerCase(),
            data: { weather: weatherData, forecast: forecastData },
            timestamp: Date.now()
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
    });
}

async function getCachedIPCity() {
    if (!db) await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction("ipCity", "readonly");
        const store = tx.objectStore("ipCity");
        const request = store.get("ip");
        request.onsuccess = () => {
            const record = request.result;
            if (record && Date.now() - record.timestamp < IP_CACHE_TTL) {
                resolve(record.city);
            } else {
                resolve(null);
            }
        };
        request.onerror = () => resolve(null);
    });
}

async function setCachedIPCity(city) {
    if (!db) await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction("ipCity", "readwrite");
        const store = tx.objectStore("ipCity");
        store.put({
            id: "ip",
            city: city,
            timestamp: Date.now()
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
    });
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    try {
        const response = await fetch("http://ip-api.com/json/", { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await response.json();
        if (data.status === "success" && data.city) {
            await setCachedIPCity(data.city);
            return data.city;
        }
    } catch (e) {}
    return null;
}

let currentChart = null;

// Исправленные функции для локального времени (с использованием смещения timezone в секундах)
function formatDateLocal(timestamp, timezoneOffset) {
    if (timezoneOffset === undefined || timezoneOffset === null) return "—";
    let localSec = timestamp + timezoneOffset;
    const daysSinceEpoch = Math.floor(localSec / 86400);
    let remainder = localSec % 86400;
    if (remainder < 0) remainder += 86400;
    const date = new Date(daysSinceEpoch * 86400 * 1000);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const hours = Math.floor(remainder / 3600);
    const minutes = Math.floor((remainder % 3600) / 60);
    const d = new Date(Date.UTC(year, month, day, hours, minutes));
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

function formatTimeLocal(timestamp, timezoneOffset) {
    if (timezoneOffset === undefined || timezoneOffset === null) return "—";
    let totalSeconds = timestamp + timezoneOffset;
    totalSeconds %= 86400;
    if (totalSeconds < 0) totalSeconds += 86400;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function formatVisibility(meters) {
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} км` : `${meters} м`;
}

const weatherIcons = {
    "01d": "☀️", "01n": "🌙",
    "02d": "⛅", "02n": "☁️",
    "03d": "☁️", "03n": "☁️",
    "04d": "☁️", "04n": "☁️",
    "09d": "🌧️", "09n": "🌧️",
    "10d": "🌦️", "10n": "🌧️",
    "11d": "⛈️", "11n": "⛈️",
    "13d": "❄️", "13n": "❄️",
    "50d": "🌫️", "50n": "🌫️",
    "default": "🌡️"
};

function getWeatherIcon(code) {
    return weatherIcons[code] || weatherIcons.default;
}

function getWeatherDescription(main) {
    const map = {
        "Clear": "Ясно",
        "Clouds": "Облачно",
        "Rain": "Дождь",
        "Snow": "Снег",
        "Thunderstorm": "Гроза",
        "Drizzle": "Морось",
        "Mist": "Туман",
        "Fog": "Туман"
    };
    return map[main] || main;
}

function getRecommendation(weather) {
    const temp = weather.main.temp;
    const wind = weather.wind.speed;
    const rain = weather.weather[0].main === "Rain" || weather.weather[0].main === "Drizzle";
    const snow = weather.weather[0].main === "Snow";
    if (snow) return { text: "❄️ Снегопад! Обувайтесь теплее.", link: "https://www.wildberries.ru/catalog/0/search.aspx?search=зимняя+обувь", linkText: "Купить зимнюю обувь" };
    if (rain) return { text: "☔ Идёт дождь. Не забудьте зонт!", link: "https://www.wildberries.ru/catalog/0/search.aspx?search=зонт", linkText: "Выбрать зонт" };
    if (temp < -10) return { text: "🥶 Очень холодно! Надевайте тёплую шапку и пуховик.", link: "https://www.wildberries.ru/catalog/0/search.aspx?search=зимняя+шапка", linkText: "Купить шапку" };
    if (temp < 0) return { text: "🧣 Холодно! Наденьте шапку и шарф.", link: "https://www.wildberries.ru/catalog/0/search.aspx?search=осенняя+шапка", linkText: "Выбрать шапку" };
    if (temp > 25) return { text: "☀️ Жарко! Пейте воду и носите головной убор.", link: "https://www.wildberries.ru/catalog/0/search.aspx?search=бутылка+для+воды", linkText: "Купить бутылку" };
    if (wind > 10) return { text: "💨 Сильный ветер! Возьмите ветровку.", link: "https://www.wildberries.ru/catalog/0/search.aspx?search=ветровка", linkText: "Выбрать ветровку" };
    return { text: "🌡️ Погода комфортная. Хорошего дня!", link: null, linkText: null };
}

function renderHourlyChart(hourlyData, canvasId, timezoneOffset) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const hours = hourlyData.map(item => {
        let totalSeconds = item.dt + timezoneOffset;
        totalSeconds %= 86400;
        if (totalSeconds < 0) totalSeconds += 86400;
        const h = Math.floor(totalSeconds / 3600);
        return `${h.toString().padStart(2, '0')}:00`;
    });
    const temps = hourlyData.map(item => Math.round(item.main.temp));
    if (currentChart) currentChart.destroy();
    currentChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: hours,
            datasets: [{
                label: 'Температура (°C)',
                data: temps,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#667eea',
                pointBorderColor: '#fff',
                pointRadius: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
    });
}

function displayDailyForecast(container, forecastList, timezoneOffset) {
    const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const daily = new Map();
    for (const item of forecastList) {
        let localSec = item.dt + timezoneOffset;
        const dayKey = Math.floor(localSec / 86400);
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
        const date = new Date(key * 86400 * 1000);
        return { date: date.toISOString().split('T')[0], avg, min, max, icon };
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
    
    const timezoneOffset = weatherData.timezone;
    if (timezoneOffset === undefined) {
        console.warn("Нет timezone в данных погоды");
    }
    const rec = getRecommendation(weatherData);
    const hourlyData = forecastList.filter(item => item.dt > Math.floor(Date.now() / 1000)).slice(0, 24);
    const isFavorite = favorites.includes(weatherData.name);
    const favStar = isFavorite ? "★" : "⭐";
    const favClass = isFavorite ? "favorite-btn active" : "favorite-btn";
    
    const html = `
        <div class="city-header">
            <h2>${weatherData.name}</h2>
            <div class="date-time">${formatDateLocal(weatherData.dt, timezoneOffset)}</div>
            <button class="${favClass}" data-city="${weatherData.name}"><span class="fav-star">${favStar}</span><span class="fav-text">${isFavorite ? "В избранном" : "В избранное"}</span></button>
        </div>
        <div class="main-weather"><div class="temp-section"><div class="current-temp">${Math.round(weatherData.main.temp)}°C</div><div class="feels-like">Ощущается как ${Math.round(weatherData.main.feels_like)}°C</div></div><div class="weather-icon"><div class="weather-emoji">${getWeatherIcon(weatherData.weather[0].icon)}</div><div class="weather-description">${getWeatherDescription(weatherData.weather[0].main)}</div></div></div>
        <div class="details-grid">
            <div class="detail-card"><div class="detail-icon">💧</div><div class="detail-label">Влажность</div><div class="detail-value">${weatherData.main.humidity}%</div></div>
            <div class="detail-card"><div class="detail-icon">🌡️</div><div class="detail-label">Давление</div><div class="detail-value">${Math.round(weatherData.main.pressure * 0.750062)} мм рт. ст.</div></div>
            <div class="detail-card"><div class="detail-icon">💨</div><div class="detail-label">Ветер</div><div class="detail-value">${weatherData.wind.speed.toFixed(1)} м/с</div></div>
            <div class="detail-card"><div class="detail-icon">☁️</div><div class="detail-label">Облачность</div><div class="detail-value">${weatherData.clouds.all}%</div></div>
        </div>        
        <div class="sun-section"><div class="sun-item"><span class="sun-icon">🌅</span><span>Восход:</span><strong>${formatTimeLocal(weatherData.sys.sunrise, timezoneOffset)}</strong></div><div class="sun-item"><span class="sun-icon">🌇</span><span>Закат:</span><strong>${formatTimeLocal(weatherData.sys.sunset, timezoneOffset)}</strong></div></div>
        <div class="recommendation-section"><div class="recommendation-text">${rec.text}</div>${rec.link ? `<a href="${rec.link}" target="_blank" rel="noopener noreferrer" class="recommendation-link">${rec.linkText} →</a>` : ''}</div>
        <div class="hourly-section"><h4>⏰ Почасовой прогноз (24 часа)</h4><div class="hourly-chart-container"><canvas id="hourlyChart-${containerId}" width="400" height="200"></canvas></div></div>
        <div class="forecast-section"><h4>📅 Прогноз на 5 дней</h4><div class="forecast-cards" id="forecast-${containerId}"><div class="forecast-loading">Загрузка...</div></div></div>
    `;
    container.innerHTML = html;
    
    if (hourlyData.length) {
        setTimeout(() => renderHourlyChart(hourlyData, `hourlyChart-${containerId}`, timezoneOffset), 30);
    } else {
        const canvasContainer = container.querySelector('.hourly-chart-container');
        if (canvasContainer) canvasContainer.innerHTML = '<p class="forecast-loading">Нет данных для почасового прогноза</p>';
    }
    const forecastContainer = document.getElementById(`forecast-${containerId}`);
    if (forecastContainer) displayDailyForecast(forecastContainer, forecastList, timezoneOffset);
    
    const favBtn = container.querySelector('.favorite-btn');
    if (favBtn) {
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const city = favBtn.dataset.city;
            if (favorites.includes(city)) {
                removeFromFavorites(city);
                favBtn.classList.remove('active');
                favBtn.querySelector('.fav-star').textContent = "⭐";
                favBtn.querySelector('.fav-text').textContent = "В избранное";
            } else {
                addToFavorites(city);
                favBtn.classList.add('active');
                favBtn.querySelector('.fav-star').textContent = "★";
                favBtn.querySelector('.fav-text').textContent = "В избранном";
            }
            updateFavoritesList();
        });
    }
}

let favorites = [];

function loadFavorites() {
    const stored = localStorage.getItem('favorites');
    favorites = stored ? JSON.parse(stored) : [];
    updateFavoritesList();
}

function saveFavorites() { localStorage.setItem('favorites', JSON.stringify(favorites)); }

function addToFavorites(city) {
    if (!favorites.includes(city)) { favorites.push(city); saveFavorites(); }
}

function removeFromFavorites(city) {
    favorites = favorites.filter(c => c !== city);
    saveFavorites();
    updateFavoritesList();
}

function updateFavoritesList() {
    const container = document.getElementById('favoritesList');
    if (!container) return;
    if (favorites.length === 0) {
        container.innerHTML = '<p class="favorites-empty">Нет избранных городов</p>';
        return;
    }
    let html = '';
    for (const city of favorites) {
        html += `<div class="favorite-item"><span class="favorite-name">${city}</span><button class="favorite-remove" data-city="${city}">✕</button></div>`;
    }
    container.innerHTML = html;
    document.querySelectorAll('.favorite-item').forEach(el => {
        const city = el.querySelector('.favorite-name').innerText;
        el.addEventListener('click', (e) => {
            if (e.target.classList.contains('favorite-remove')) return;
            searchAndShowFull(city);
        });
        const removeBtn = el.querySelector('.favorite-remove');
        if (removeBtn) removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeFromFavorites(city); });
    });
}

async function loadLocationWeather() {
    const locationContent = document.getElementById("locationContent");
    locationContent.innerHTML = `<div class="loading-container"><div class="loading-spinner"></div><p>Определяем ваш город...</p></div>`;
    let city = await getCityByIP();
    if (!city) city = "Moscow";
    try {
        const { weather, forecast } = await getWeatherData(city);
        renderWeatherToContainer(weather, forecast, "locationContent");
    } catch (e) {
        locationContent.innerHTML = '<div class="loading-container"><p>Ошибка загрузки</p></div>';
    }
}

async function searchAndShowFull(city) {
    const fullContent = document.getElementById("fullContent");
    fullContent.innerHTML = `<div class="loading-container"><div class="loading-spinner"></div><p>Поиск города ${city}...</p></div>`;
    try {
        const { weather, forecast } = await getWeatherData(city);
        document.getElementById("searchedCityTitle").textContent = `Погода в ${weather.name}`;
        renderWeatherToContainer(weather, forecast, "fullContent");
        document.getElementById("splitLayout").style.display = "none";
        document.getElementById("fullLayout").style.display = "block";
    } catch (err) {
        fullContent.innerHTML = `<div class="loading-container"><p style="color:#e53e3e;">❌ Город "${city}" не найден</p><p style="margin-top:12px;">Проверьте название и попробуйте снова</p></div>`;
    }
}

function goBackToSplit() {
    document.getElementById("fullLayout").style.display = "none";
    document.getElementById("splitLayout").style.display = "grid";
    document.getElementById("cityInput").value = "";
}

function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
        document.body.classList.add('dark');
        document.getElementById('themeToggle').textContent = '☀️';
    } else {
        document.body.classList.remove('dark');
        document.getElementById('themeToggle').textContent = '🌙';
    }
}

function toggleTheme() {
    if (document.body.classList.contains('dark')) {
        document.body.classList.remove('dark');
        localStorage.setItem('theme', 'light');
        document.getElementById('themeToggle').textContent = '🌙';
    } else {
        document.body.classList.add('dark');
        localStorage.setItem('theme', 'dark');
        document.getElementById('themeToggle').textContent = '☀️';
    }
}

openDB().then(() => {
    loadFavorites();
    loadLocationWeather();
    initTheme();
    const searchBtn = document.getElementById("searchBtn");
    const cityInput = document.getElementById("cityInput");
    const backBtn = document.getElementById("backBtn");
    const themeBtn = document.getElementById("themeToggle");
    searchBtn.addEventListener("click", () => {
        const city = cityInput.value.trim();
        if (!city) { alert("Введите название города"); return; }
        searchAndShowFull(city);
    });
    cityInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            const city = cityInput.value.trim();
            if (city) searchAndShowFull(city);
        }
    });
    backBtn.addEventListener("click", goBackToSplit);
    themeBtn.addEventListener("click", toggleTheme);
}).catch(console.error);

// Генерация кода виджета
const generateBtn = document.getElementById('generateWidgetBtn');
if (generateBtn) {
    generateBtn.addEventListener('click', () => {
        let city = document.getElementById('widgetCity').value.trim();
        const theme = document.getElementById('widgetTheme').value;
        const size = document.getElementById('widgetSize').value;
        let url = `${window.location.origin}/widget.html?theme=${theme}&size=${size}`;
        if (city) url += `&city=${encodeURIComponent(city)}`;
        else url += `&city=auto`;
        const iframeCode = `<iframe src="${url}" width="100%" height="${size === 'compact' ? '280' : '380'}" frameborder="0" scrolling="no" style="border-radius: 44px; max-width: 450px; margin: 0 auto; display: block;"></iframe>`;
        document.getElementById('widgetCode').value = iframeCode;
        document.getElementById('widgetCodeContainer').style.display = 'block';
    });
}
const copyBtn = document.getElementById('copyWidgetCode');
if (copyBtn) {
    copyBtn.addEventListener('click', () => {
        const codeArea = document.getElementById('widgetCode');
        codeArea.select();
        document.execCommand('copy');
        alert('Код скопирован в буфер обмена');
    });
}