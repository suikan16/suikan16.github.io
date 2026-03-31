const API_KEY = "c2f9cfdd2cb513c0f812f89130d91f2b";

// ========== КЭШИ ==========
const forecastCache = new Map();
const CITY_CACHE_KEY = "cached_city";
const CITY_CACHE_TTL = 86400000; // 24 часа

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
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

// ========== РЕКОМЕНДАЦИИ ==========
function getRecommendation(weather) {
    const temp = weather.main.temp;
    const wind = weather.wind.speed;
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

// ========== ПОЧАСОВОЙ ГРАФИК ==========
let currentChart = null;

function renderHourlyChart(hourlyData, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const hours = hourlyData.map(item => new Date(item.dt * 1000).getHours() + ":00");
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
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } }
        }
    });
}

// ========== ОТРИСОВКА ВИДЖЕТА ==========
function renderWeatherToContainer(weatherData, forecastList, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const rec = getRecommendation(weatherData);
    const hourlyData = forecastList.filter(item => item.dt > Math.floor(Date.now() / 1000)).slice(0, 24);

    const html = `
        <div class="city-header">
            <h2>${weatherData.name}</h2>
            <div class="date-time">${formatDate(weatherData.dt)}</div>
            <button class="favorite-toggle" data-city="${weatherData.name}">⭐ Добавить в избранное</button>
        </div>
        <div class="main-weather">
            <div class="temp-section">
                <div class="current-temp">${Math.round(weatherData.main.temp)}°C</div>
                <div class="feels-like">Ощущается как ${Math.round(weatherData.main.feels_like)}°C</div>
            </div>
            <div class="weather-icon">
                <div class="weather-emoji">${getWeatherIcon(weatherData.weather[0].icon)}</div>
                <div class="weather-description">${getWeatherDescription(weatherData.weather[0].main)}</div>
            </div>
        </div>
        <div class="details-grid">
            <div class="detail-card"><div class="detail-icon">💧</div><div class="detail-label">Влажность</div><div class="detail-value">${weatherData.main.humidity}%</div></div>
            <div class="detail-card"><div class="detail-icon">🌡️</div><div class="detail-label">Давление</div><div class="detail-value">${Math.round(weatherData.main.pressure * 0.750062)} мм рт. ст.</div></div>
            <div class="detail-card"><div class="detail-icon">💨</div><div class="detail-label">Ветер</div><div class="detail-value">${weatherData.wind.speed.toFixed(1)} м/с</div></div>
            <div class="detail-card"><div class="detail-icon">👁️</div><div class="detail-label">Видимость</div><div class="detail-value">${formatVisibility(weatherData.visibility)}</div></div>
        </div>
        <div class="sun-section">
            <div class="sun-item"><span class="sun-icon">🌅</span><span>Восход:</span><strong>${formatTime(weatherData.sys.sunrise)}</strong></div>
            <div class="sun-item"><span class="sun-icon">🌇</span><span>Закат:</span><strong>${formatTime(weatherData.sys.sunset)}</strong></div>
        </div>
        <div class="recommendation-section">
            <div class="recommendation-text">${rec.text}</div>
            ${rec.link ? `<a href="${rec.link}" target="_blank" rel="noopener noreferrer" class="recommendation-link">${rec.linkText} →</a>` : ''}
        </div>
        <div class="hourly-section">
            <h4>⏰ Почасовой прогноз (24 часа)</h4>
            <div class="hourly-chart-container">
                <canvas id="hourlyChart-${containerId}" width="400" height="200"></canvas>
            </div>
        </div>
        <div class="forecast-section">
            <h4>📅 Прогноз на 5 дней</h4>
            <div class="forecast-cards" id="forecast-${containerId}">
                <div class="forecast-loading">Загрузка...</div>
            </div>
        </div>
    `;

    container.innerHTML = html;

    if (hourlyData.length) {
        setTimeout(() => renderHourlyChart(hourlyData, `hourlyChart-${containerId}`), 30);
    } else {
        const canvasContainer = container.querySelector('.hourly-chart-container');
        if (canvasContainer) canvasContainer.innerHTML = '<p class="forecast-loading">Нет данных для почасового прогноза</p>';
    }

    const forecastContainer = document.getElementById(`forecast-${containerId}`);
    if (forecastContainer) {
        displayDailyForecast(forecastContainer, forecastList);
    }

    const favBtn = container.querySelector('.favorite-toggle');
    if (favBtn) {
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            addToFavorites(weatherData.name);
            updateFavoritesList();
        });
    }
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
        html += `
            <div class="forecast-card">
                <div class="day">${dayName}</div>
                <div class="date">${dayMonth}</div>
                <div class="forecast-emoji">${getWeatherIcon(day.icon)}</div>
                <div class="temp">${day.avg}°</div>
                <div class="temp-range">${day.min}° / ${day.max}°</div>
            </div>
        `;
    }
    container.innerHTML = html || '<div class="forecast-loading">Нет данных прогноза</div>';
}

// ========== ОПРЕДЕЛЕНИЕ ГОРОДА ПО IP (ТОЛЬКО ip-api.com) ==========
async function getCityByIP() {
    // Проверяем кэш
    const cached = localStorage.getItem(CITY_CACHE_KEY);
    if (cached) {
        try {
            const { city, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < CITY_CACHE_TTL) {
                console.log("Город из кэша:", city);
                return city;
            }
        } catch (e) {}
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 секунды

    try {
        const response = await fetch("http://ip-api.com/json/", { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await response.json();
        if (data.status === "success" && data.city) {
            const city = data.city;
            localStorage.setItem(CITY_CACHE_KEY, JSON.stringify({ city, timestamp: Date.now() }));
            console.log("Город определён через ip-api.com:", city);
            return city;
        }
        throw new Error("Не удалось определить город");
    } catch (error) {
        console.warn("Ошибка определения города:", error.message);
        return null;
    }
}

async function loadLocationWeather() {
    const locationContent = document.getElementById("locationContent");
    locationContent.innerHTML = `<div class="loading-container"><div class="loading-spinner"></div><p>Определяем ваш город...</p></div>`;

    const cityPromise = getCityByIP();
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), 2500));
    const city = await Promise.race([cityPromise, timeout]);

    if (city) {
        try {
            const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric&lang=ru`);
            const weather = await weatherRes.json();
            if (weather.cod === 200) {
                const forecastRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${API_KEY}&units=metric&lang=ru`);
                const forecast = await forecastRes.json();
                renderWeatherToContainer(weather, forecast.list, "locationContent");
                return;
            }
        } catch (e) {}
    }

    // Если не получилось – Москва
    try {
        const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=Moscow&appid=${API_KEY}&units=metric&lang=ru`);
        const weather = await weatherRes.json();
        const forecastRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=Moscow&appid=${API_KEY}&units=metric&lang=ru`);
        const forecast = await forecastRes.json();
        renderWeatherToContainer(weather, forecast.list, "locationContent");
    } catch (e) {
        locationContent.innerHTML = '<div class="loading-container"><p>Ошибка загрузки</p></div>';
    }
}

// ========== ИЗБРАННОЕ ==========
let favorites = [];

function loadFavorites() {
    const stored = localStorage.getItem('favorites');
    favorites = stored ? JSON.parse(stored) : [];
    updateFavoritesList();
}

function saveFavorites() {
    localStorage.setItem('favorites', JSON.stringify(favorites));
}

function addToFavorites(city) {
    if (!favorites.includes(city)) {
        favorites.push(city);
        saveFavorites();
    }
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
        html += `
            <div class="favorite-item">
                <span class="favorite-name">${city}</span>
                <button class="favorite-remove" data-city="${city}">✕</button>
            </div>
        `;
    }
    container.innerHTML = html;

    document.querySelectorAll('.favorite-item').forEach(el => {
        const city = el.querySelector('.favorite-name').innerText;
        el.addEventListener('click', (e) => {
            if (e.target.classList.contains('favorite-remove')) return;
            searchAndShowFull(city);
        });
        const removeBtn = el.querySelector('.favorite-remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeFromFavorites(city);
            });
        }
    });
}

// ========== ПОИСК И ПОЛНОЭКРАННЫЙ РЕЖИМ ==========
async function searchAndShowFull(city) {
    const fullContent = document.getElementById("fullContent");
    fullContent.innerHTML = `<div class="loading-container"><div class="loading-spinner"></div><p>Поиск города ${city}...</p></div>`;

    try {
        const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric&lang=ru`);
        const weather = await weatherRes.json();
        if (weather.cod !== 200) throw new Error();

        const forecastRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${API_KEY}&units=metric&lang=ru`);
        const forecast = await forecastRes.json();

        document.getElementById("searchedCityTitle").textContent = `Погода в ${weather.name}`;
        renderWeatherToContainer(weather, forecast.list, "fullContent");

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

// ========== ТЁМНАЯ ТЕМА ==========
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

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener("DOMContentLoaded", () => {
    loadFavorites();
    loadLocationWeather();
    initTheme();

    const searchBtn = document.getElementById("searchBtn");
    const cityInput = document.getElementById("cityInput");
    const backBtn = document.getElementById("backBtn");
    const themeBtn = document.getElementById("themeToggle");

    searchBtn.addEventListener("click", () => {
        const city = cityInput.value.trim();
        if (!city) {
            alert("Введите название города");
            return;
        }
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
});