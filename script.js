const API_KEY = "c2f9cfdd2cb513c0f812f89130d91f2b";
const forecastCache = {};

// Иконки
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

function getWeatherIcon(iconCode) {
    return weatherIcons[iconCode] || weatherIcons.default;
}

function getWeatherDescription(weatherMain) {
    const desc = {
        "Clear": "Ясно",
        "Clouds": "Облачно",
        "Rain": "Дождь",
        "Snow": "Снег",
        "Thunderstorm": "Гроза",
        "Drizzle": "Морось",
        "Mist": "Туман",
        "Fog": "Туман"
    };
    return desc[weatherMain] || weatherMain;
}

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

// ========== Отрисовка погоды ==========
function renderWeatherToContainer(data, containerId, isFullMode = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const iconCode = data.weather[0].icon;
    const weatherMain = data.weather[0].main;

    const html = `
        <div class="city-header">
            <h2>${data.name}</h2>
            <div class="date-time">${formatDate(data.dt)}</div>
        </div>
        <div class="main-weather">
            <div class="temp-section">
                <div class="current-temp">${Math.round(data.main.temp)}°C</div>
                <div class="feels-like">Ощущается как ${Math.round(data.main.feels_like)}°C</div>
            </div>
            <div class="weather-icon">
                <div class="weather-emoji">${getWeatherIcon(iconCode)}</div>
                <div class="weather-description">${getWeatherDescription(weatherMain)}</div>
            </div>
        </div>
        <div class="details-grid">
            <div class="detail-card">
                <div class="detail-icon">💧</div>
                <div class="detail-label">Влажность</div>
                <div class="detail-value">${data.main.humidity}%</div>
            </div>
            <div class="detail-card">
                <div class="detail-icon">🌡️</div>
                <div class="detail-label">Давление</div>
                <div class="detail-value">${Math.round(data.main.pressure * 0.750062)} мм рт. ст.</div>
            </div>
            <div class="detail-card">
                <div class="detail-icon">💨</div>
                <div class="detail-label">Ветер</div>
                <div class="detail-value">${data.wind.speed.toFixed(1)} м/с</div>
            </div>
            <div class="detail-card">
                <div class="detail-icon">👁️</div>
                <div class="detail-label">Видимость</div>
                <div class="detail-value">${formatVisibility(data.visibility)}</div>
            </div>
        </div>
        <div class="sun-section">
            <div class="sun-item">
                <span class="sun-icon">🌅</span>
                <span>Восход:</span>
                <strong>${formatTime(data.sys.sunrise)}</strong>
            </div>
            <div class="sun-item">
                <span class="sun-icon">🌇</span>
                <span>Закат:</span>
                <strong>${formatTime(data.sys.sunset)}</strong>
            </div>
        </div>
        <div class="forecast-section">
            <h4>📅 Прогноз на 5 дней</h4>
            <div class="forecast-cards" id="forecast-${containerId}">
                <div class="forecast-loading">Загрузка прогноза...</div>
            </div>
        </div>
    `;

    container.innerHTML = html;
    loadForecastToContainer(data.name, containerId);
}

// Загрузка прогноза в конкретный контейнер
async function loadForecastToContainer(city, containerId) {
    const forecastContainer = document.getElementById(`forecast-${containerId}`);
    if (!forecastContainer) return;

    const cacheKey = `${city}_${containerId}`;
    if (forecastCache[cacheKey]) {
        displayForecastToContainer(forecastCache[cacheKey], forecastContainer);
        return;
    }

    try {
        forecastContainer.innerHTML = `
            <div class="forecast-skeleton">
                ${[1,2,3,4,5].map(() => `
                    <div class="forecast-card skeleton">
                        <div class="skeleton-line"></div>
                        <div class="skeleton-line"></div>
                        <div class="skeleton-icon"></div>
                        <div class="skeleton-line"></div>
                    </div>
                `).join('')}
            </div>
        `;

        const res = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${API_KEY}&units=metric&lang=ru`);
        const data = await res.json();
        if (data.cod !== "200") throw new Error(data.message);

        const forecast = processForecast(data);
        forecastCache[cacheKey] = forecast;
        displayForecastToContainer(forecast, forecastContainer);
    } catch (err) {
        console.error(err);
        forecastContainer.innerHTML = '<div class="forecast-loading">Не удалось загрузить прогноз</div>';
    }
}

function processForecast(data) {
    const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const today = new Date().setHours(0, 0, 0, 0);
    const dayMap = new Map();

    for (const item of data.list) {
        const date = new Date(item.dt * 1000);
        const dayStart = date.setHours(0, 0, 0, 0);
        if (dayStart === today) continue;
        const dateKey = date.toISOString().split('T')[0];

        if (!dayMap.has(dateKey)) {
            dayMap.set(dateKey, {
                date: dateKey,
                temps: [],
                tempMins: [],
                tempMaxs: [],
                icons: []
            });
        }
        const day = dayMap.get(dateKey);
        day.temps.push(item.main.temp);
        day.tempMins.push(item.main.temp_min);
        day.tempMaxs.push(item.main.temp_max);
        const hour = date.getHours();
        if (hour >= 11 && hour <= 13) day.icons.push(item.weather[0].icon);
    }

    const forecastList = Array.from(dayMap.values()).slice(0, 5).map(day => ({
        date: day.date,
        temp_avg: Math.round(day.temps.reduce((a,b)=>a+b,0)/day.temps.length),
        temp_min: Math.round(Math.min(...day.tempMins)),
        temp_max: Math.round(Math.max(...day.tempMaxs)),
        icon: day.icons[0] || "01d"
    }));
    return { forecastList, days };
}

function displayForecastToContainer(forecastData, container) {
    const { forecastList, days } = forecastData;
    if (!forecastList.length) {
        container.innerHTML = '<div class="forecast-loading">Нет данных</div>';
        return;
    }
    let html = '';
    for (const day of forecastList) {
        const date = new Date(day.date);
        const dayName = days[date.getDay()];
        const dayMonth = `${date.getDate()}.${date.getMonth()+1}`;
        html += `
            <div class="forecast-card">
                <div class="day">${dayName}</div>
                <div class="date">${dayMonth}</div>
                <div class="forecast-emoji">${getWeatherIcon(day.icon)}</div>
                <div class="temp">${day.temp_avg}°</div>
                <div class="temp-range">${day.temp_min}° / ${day.temp_max}°</div>
            </div>
        `;
    }
    container.innerHTML = html;
}

// ========== Загрузка по IP (для виджета местоположения) ==========
async function loadLocationWeather() {
    const locationContent = document.getElementById("locationContent");
    locationContent.innerHTML = `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <p>Определяем ваш город...</p>
        </div>
    `;

    const services = [
        { name: "ipapi.co", url: "https://ipapi.co/json/", getCity: d => d.city },
        { name: "ipwho.is", url: "https://ipwho.is/", getCity: d => d.city },
        { name: "ip-api.com", url: "https://ip-api.com/json/", getCity: d => d.city },
        { name: "geoplugin", url: "https://www.geoplugin.net/json.gp", getCity: d => d.geoplugin_city },
        { name: "ipinfo.io", url: "https://ipinfo.io/json", getCity: d => d.city }
    ];

    let city = null;
    for (const s of services) {
        try {
            const resp = await fetch(s.url);
            if (!resp.ok) continue;
            const data = await resp.json();
            const detected = s.getCity(data);
            if (detected && detected !== "null" && detected !== "") {
                city = detected;
                break;
            }
        } catch(e) {}
    }

    if (city) {
        try {
            const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric&lang=ru`);
            const weatherData = await weatherRes.json();
            if (weatherData.cod === 200) {
                renderWeatherToContainer(weatherData, "locationContent");
                return;
            }
        } catch(e) {}
    }

    // fallback: Москва
    try {
        const fallback = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=Moscow&appid=${API_KEY}&units=metric&lang=ru`);
        const data = await fallback.json();
        renderWeatherToContainer(data, "locationContent");
    } catch(e) {
        locationContent.innerHTML = '<div class="loading-container"><p>Ошибка загрузки</p></div>';
    }
}

// ========== Поиск города ==========
async function searchAndShowFull(city) {
    const fullContent = document.getElementById("fullContent");
    fullContent.innerHTML = `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <p>Поиск города ${city}...</p>
        </div>
    `;

    try {
        const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric&lang=ru`);
        const data = await response.json();
        if (data.cod !== 200) throw new Error(data.message);

        // Обновляем заголовок
        document.getElementById("searchedCityTitle").textContent = `Погода в ${data.name}`;
        renderWeatherToContainer(data, "fullContent", true);

        // Переключаем режимы
        document.getElementById("splitLayout").style.display = "none";
        document.getElementById("fullLayout").style.display = "block";
    } catch (err) {
        fullContent.innerHTML = `
            <div class="loading-container">
                <p style="color:#e53e3e;">❌ Город "${city}" не найден</p>
                <p style="margin-top:12px;">Проверьте название и попробуйте снова</p>
            </div>
        `;
    }
}

// ========== Обработчики ==========
function goBackToSplit() {
    document.getElementById("fullLayout").style.display = "none";
    document.getElementById("splitLayout").style.display = "grid";
    // Очищаем поле ввода
    document.getElementById("cityInput").value = "";
    // При желании можно перезагрузить виджет местоположения (но можно и оставить как есть)
    // loadLocationWeather(); // если хотим обновить
}

// Инициализация
document.addEventListener("DOMContentLoaded", () => {
    loadLocationWeather();

    const searchBtn = document.getElementById("searchBtn");
    const cityInput = document.getElementById("cityInput");
    const backBtn = document.getElementById("backBtn");

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
});