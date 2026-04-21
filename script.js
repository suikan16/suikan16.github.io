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
            if (!db.objectStoreNames.contains("weatherDiary")) {
                db.createObjectStore("weatherDiary", { keyPath: "id" });
                console.log("Хранилище дневника создано");
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
        const response = await fetch("https://ip-api.com/json/", { signal: controller.signal });
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

// ========== ПОГОДНЫЙ ДНЕВНИК ==========
const DIARY_STORE = "weatherDiary";

async function getDiaryEntry(date) {
    if (!db) return null;
    if (!db.objectStoreNames.contains(DIARY_STORE)) return null;
    
    return new Promise((resolve) => {
        const tx = db.transaction(DIARY_STORE, 'readonly');
        const store = tx.objectStore(DIARY_STORE);
        const request = store.get(date);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
    });
}

async function getCurrentWeatherForDiary() {
    const cityName = document.querySelector('.city-header h2')?.innerText;
    if (cityName && cityName !== '--') {
        try {
            const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${cityName}&appid=${API_KEY}&units=metric&lang=ru`);
            const data = await response.json();
            if (data.cod === 200) {
                return {
                    temp: Math.round(data.main.temp),
                    description: data.weather[0].description,
                    humidity: data.main.humidity,
                    pressure: Math.round(data.main.pressure * 0.750062)
                };
            }
        } catch(e) {}
    }
    return { temp: '--', description: '--', humidity: '--', pressure: '--' };
}

async function saveDiaryEntry() {
    const selectedMood = document.querySelector('.mood-btn.selected')?.dataset.mood;
    if (!selectedMood) {
        alert('Пожалуйста, оцените ваше самочувствие');
        return;
    }
    
    const symptoms = Array.from(document.querySelectorAll('.symptoms-grid input:checked')).map(cb => cb.value);
    const badSleep = document.getElementById('badSleep')?.checked || false;
    const medications = document.getElementById('medications')?.checked || false;
    const today = new Date().toISOString().split('T')[0];
    const currentWeather = await getCurrentWeatherForDiary();
    
    const entry = {
        id: today,
        date: today,
        mood: parseInt(selectedMood),
        symptoms,
        badSleep,
        medications,
        weather: currentWeather,
        timestamp: Date.now()
    };
    
    if (!db || !db.objectStoreNames.contains(DIARY_STORE)) return;
    
    const tx = db.transaction(DIARY_STORE, 'readwrite');
    const store = tx.objectStore(DIARY_STORE);
    store.put(entry);
    tx.oncomplete = () => {
        alert('Запись сохранена!');
        loadDiaryStats();
        updateDiaryPreview();
        closeDiary();
    };
    tx.onerror = () => alert('Ошибка сохранения');
}

async function loadDiaryStats() {
    const container = document.getElementById('diaryStats');
    if (!container) return;
    
    if (!db || !db.objectStoreNames.contains(DIARY_STORE)) {
        container.innerHTML = '<p class="forecast-loading">Нет записей. Начните вести дневник!</p>';
        return;
    }
    
    const tx = db.transaction(DIARY_STORE, 'readonly');
    const store = tx.objectStore(DIARY_STORE);
    const allEntries = await new Promise((resolve) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve([]);
    });
    
    if (allEntries.length === 0) {
        container.innerHTML = '<p class="forecast-loading">Нет записей. Начните вести дневник!</p>';
        return;
    }
    
    const avgMood = allEntries.reduce((sum, e) => sum + e.mood, 0) / allEntries.length;
    const headacheDays = allEntries.filter(e => e.symptoms.includes('headache')).length;
    
    container.innerHTML = `
        <div style="background: var(--detail-bg); border-radius: 20px; padding: 12px; margin-top: 12px;">
            <p>📊 Записей: ${allEntries.length}</p>
            <p>😊 Среднее самочувствие: ${avgMood.toFixed(1)} / 5</p>
            <p>🤕 Головная боль: в ${headacheDays} днях</p>
            <p style="font-size: 12px; margin-top: 8px;">💡 Совет: регулярные записи помогут увидеть связь между погодой и вашим состоянием</p>
        </div>
    `;
}

async function updateDiaryPreview() {
    const preview = document.getElementById('diaryPreview');
    if (!preview) return;
    
    if (!db || !db.objectStoreNames.contains(DIARY_STORE)) {
        preview.innerHTML = '<p class="diary-preview-text">Начните вести дневник самочувствия</p>';
        return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    const entry = await getDiaryEntry(today);
    
    if (entry) {
        const moodText = {5:'Отлично',4:'Хорошо',3:'Нормально',2:'Плохо',1:'Ужасно'}[entry.mood];
        preview.innerHTML = `<p class="diary-preview-text">✅ Сегодня: ${moodText}${entry.symptoms.length ? `, беспокоит: ${entry.symptoms.join(', ')}` : ''}</p>`;
    } else {
        preview.innerHTML = '<p class="diary-preview-text">📝 Сегодня вы ещё не вели дневник</p>';
    }
}

async function loadDiaryForm() {
    const container = document.getElementById('diaryFormContainer');
    if (!container) return;
    
    const today = new Date().toISOString().split('T')[0];
    const existingEntry = await getDiaryEntry(today);
    const currentWeather = await getCurrentWeatherForDiary();
    
    container.innerHTML = `
        <div class="diary-form-group">
            <label>📅 ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</label>
            <div class="diary-weather-info" style="background: var(--detail-bg); padding: 12px; border-radius: 20px; margin-top: 8px;">
                🌡️ ${currentWeather.temp}°C, ${currentWeather.description}, 💧 ${currentWeather.humidity}%, 🌡️ ${currentWeather.pressure} мм рт. ст.
            </div>
        </div>
        
        <div class="diary-form-group">
            <label>Как вы себя чувствуете?</label>
            <div class="mood-buttons" id="moodButtons">
                <button data-mood="5" class="mood-btn ${existingEntry?.mood === 5 ? 'selected' : ''}">😊 Отлично</button>
                <button data-mood="4" class="mood-btn ${existingEntry?.mood === 4 ? 'selected' : ''}">🙂 Хорошо</button>
                <button data-mood="3" class="mood-btn ${existingEntry?.mood === 3 ? 'selected' : ''}">😐 Нормально</button>
                <button data-mood="2" class="mood-btn ${existingEntry?.mood === 2 ? 'selected' : ''}">😕 Плохо</button>
                <button data-mood="1" class="mood-btn ${existingEntry?.mood === 1 ? 'selected' : ''}">😫 Ужасно</button>
            </div>
        </div>
        
        <div class="diary-form-group">
            <label>Что вас беспокоит?</label>
            <div class="symptoms-grid">
                <label class="symptom-checkbox"><input type="checkbox" value="headache" ${existingEntry?.symptoms?.includes('headache') ? 'checked' : ''}> Головная боль</label>
                <label class="symptom-checkbox"><input type="checkbox" value="pressure" ${existingEntry?.symptoms?.includes('pressure') ? 'checked' : ''}> Скачки давления</label>
                <label class="symptom-checkbox"><input type="checkbox" value="joints" ${existingEntry?.symptoms?.includes('joints') ? 'checked' : ''}> Боль в суставах</label>
                <label class="symptom-checkbox"><input type="checkbox" value="fatigue" ${existingEntry?.symptoms?.includes('fatigue') ? 'checked' : ''}> Усталость</label>
                <label class="symptom-checkbox"><input type="checkbox" value="insomnia" ${existingEntry?.symptoms?.includes('insomnia') ? 'checked' : ''}> Бессонница</label>
                <label class="symptom-checkbox"><input type="checkbox" value="irritability" ${existingEntry?.symptoms?.includes('irritability') ? 'checked' : ''}> Раздражительность</label>
            </div>
        </div>
        
        <div class="diary-form-group">
            <label>Дополнительно</label>
            <label class="symptom-checkbox"><input type="checkbox" id="badSleep" ${existingEntry?.badSleep ? 'checked' : ''}> Плохо спал(а)</label>
            <label class="symptom-checkbox"><input type="checkbox" id="medications" ${existingEntry?.medications ? 'checked' : ''}> Принимал(а) лекарства</label>
        </div>
        
        <button class="diary-save-btn" onclick="saveDiaryEntry()">💾 Сохранить запись</button>
        
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-color);">
            <h4>📊 Ваша статистика</h4>
            <div id="diaryStats">Загрузка...</div>
        </div>
    `;
    
    document.querySelectorAll('.mood-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });
    
    loadDiaryStats();
}

function openDiary() {
    const modal = document.createElement('div');
    modal.className = 'diary-modal';
    modal.id = 'diaryModal';
    modal.innerHTML = `
        <div class="diary-modal-content">
            <div class="diary-modal-header">
                <h3>📓 Погодный дневник</h3>
                <button class="diary-close-btn" onclick="closeDiary()">✕</button>
            </div>
            <div id="diaryFormContainer">
                <div class="loading-container"><div class="loading-spinner"></div><p>Загрузка...</p></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    loadDiaryForm();
}

function closeDiary() {
    const modal = document.getElementById('diaryModal');
    if (modal) modal.remove();
}

// ========== ГЕНЕРАЦИЯ ВИДЖЕТА ==========
function initWidgetGenerator() {
    const generateBtn = document.getElementById('generateWidgetBtn');
    if (!generateBtn) return;
    
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
    
    const copyBtn = document.getElementById('copyWidgetCode');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const codeArea = document.getElementById('widgetCode');
            codeArea.select();
            document.execCommand('copy');
            alert('Код скопирован в буфер обмена');
        });
    }
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
openDB().then(() => {
    loadFavorites();
    loadLocationWeather();
    initTheme();
    initWidgetGenerator();
    updateDiaryPreview();
    
    const openDiaryBtn = document.getElementById('openDiaryBtn');
    if (openDiaryBtn) {
        openDiaryBtn.addEventListener('click', openDiary);
    }
    
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