const API_KEY = "c2f9cfdd2cb513c0f812f89130d91f2b";

// Кэш для прогноза
const forecastCache = {};

// ========== СОБСТВЕННЫЕ ИКОНКИ ==========
const weatherIcons = {
    // Ясно
    "01d": "☀️",
    "01n": "🌙",
    // Мало облаков
    "02d": "⛅",
    "02n": "☁️",
    // Облачно
    "03d": "☁️",
    "03n": "☁️",
    "04d": "☁️",
    "04n": "☁️",
    // Дождь
    "09d": "🌧️",
    "09n": "🌧️",
    "10d": "🌦️",
    "10n": "🌧️",
    "11d": "⛈️",
    "11n": "⛈️",
    // Снег
    "13d": "❄️",
    "13n": "❄️",
    // Туман
    "50d": "🌫️",
    "50n": "🌫️",
    // По умолчанию
    "default": "🌡️"
};

// Функция получения иконки по коду погоды
function getWeatherIcon(iconCode) {
    return weatherIcons[iconCode] || weatherIcons.default;
}

// Форматирование даты
function formatDate(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Форматирование времени
function formatTime(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Форматирование видимости
function formatVisibility(meters) {
    if (meters >= 1000) {
        return `${(meters / 1000).toFixed(1)} км`;
    }
    return `${meters} м`;
}

// Получение описания погоды на русском
function getWeatherDescription(weatherMain, weatherDesc) {
    const descriptions = {
        "Clear": "Ясно",
        "Clouds": "Облачно",
        "Rain": "Дождь",
        "Snow": "Снег",
        "Thunderstorm": "Гроза",
        "Drizzle": "Морось",
        "Mist": "Туман",
        "Fog": "Туман",
        "Haze": "Дымка"
    };
    return descriptions[weatherMain] || weatherDesc;
}

// Отображение погоды
function renderWeather(data) {
    const widget = document.getElementById("weatherWidget");
    const iconCode = data.weather[0].icon;
    const weatherMain = data.weather[0].main;
    const weatherDesc = data.weather[0].description;
    
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
                <div class="weather-description">${getWeatherDescription(weatherMain, weatherDesc)}</div>
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
            <h3>📅 Прогноз на 5 дней</h3>
            <div class="forecast-cards" id="forecastContainer">
                <div class="forecast-loading">Загрузка прогноза...</div>
            </div>
        </div>
    `;
    
    widget.innerHTML = html;
    setTimeout(() => loadForecast(data.name), 10);
}

// Загрузка прогноза
async function loadForecast(city) {
    const container = document.getElementById("forecastContainer");
    if (!container) return;
    
    if (forecastCache[city]) {
        displayForecastCards(forecastCache[city]);
        return;
    }
    
    try {
        container.innerHTML = `
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
        
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${API_KEY}&units=metric&lang=ru`
        );
        const data = await response.json();
        
        if (data.cod !== "200") {
            throw new Error(data.message);
        }
        
        const forecast = processForecastFast(data);
        forecastCache[city] = forecast;
        displayForecastCards(forecast);
        
    } catch (error) {
        console.error("Ошибка прогноза:", error);
        container.innerHTML = '<div class="forecast-loading">Не удалось загрузить прогноз</div>';
    }
}

// Быстрая обработка прогноза
function processForecastFast(data) {
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
        if (hour >= 11 && hour <= 13) {
            day.icons.push(item.weather[0].icon);
        }
    }
    
    const forecastList = Array.from(dayMap.values())
        .slice(0, 5)
        .map(day => ({
            date: day.date,
            temp_avg: Math.round(day.temps.reduce((a, b) => a + b, 0) / day.temps.length),
            temp_min: Math.round(Math.min(...day.tempMins)),
            temp_max: Math.round(Math.max(...day.tempMaxs)),
            icon: day.icons[0] || "01d"
        }));
    
    return { forecastList, days };
}

// Отображение карточек прогноза с собственными иконками
function displayForecastCards(forecastData) {
    const container = document.getElementById("forecastContainer");
    if (!container) return;
    
    const { forecastList, days } = forecastData;
    
    if (!forecastList.length) {
        container.innerHTML = '<div class="forecast-loading">Нет данных прогноза</div>';
        return;
    }
    
    let html = '';
    
    for (const day of forecastList) {
        const date = new Date(day.date);
        const dayName = days[date.getDay()];
        const dayMonth = `${date.getDate()}.${date.getMonth() + 1}`;
        const iconEmoji = getWeatherIcon(day.icon);
        
        html += `
            <div class="forecast-card">
                <div class="day">${dayName}</div>
                <div class="date">${dayMonth}</div>
                <div class="forecast-emoji">${iconEmoji}</div>
                <div class="temp">${day.temp_avg}°</div>
                <div class="temp-range">${day.temp_min}° / ${day.temp_max}°</div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// Показать загрузку
function showLoading(message = "Загрузка...") {
    const widget = document.getElementById("weatherWidget");
    widget.innerHTML = `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <p>${message}</p>
        </div>
    `;
}

// Поиск по городу
async function searchWeather() {
    const city = document.getElementById("cityInput").value.trim();
    if (!city) {
        alert("Введите название города");
        return;
    }
    
    showLoading("Поиск города...");
    
    try {
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric&lang=ru`
        );
        const data = await response.json();
        
        if (data.cod !== 200) {
            throw new Error(data.message);
        }
        
        renderWeather(data);
    } catch (error) {
        alert("Город не найден. Проверьте название.");
        loadWeatherByIP();
    }
}

// Определение по IP
async function loadWeatherByIP() {
    showLoading("Определяем ваш город...");
    
    const services = [
        { name: "ipapi.co", url: "https://ipapi.co/json/", getCity: (d) => d.city },
        { name: "ipwho.is", url: "https://ipwho.is/", getCity: (d) => d.city },
        { name: "ip-api.com", url: "https://ip-api.com/json/", getCity: (d) => d.city },
        { name: "geoplugin", url: "https://www.geoplugin.net/json.gp", getCity: (d) => d.geoplugin_city },
        { name: "ipinfo.io", url: "https://ipinfo.io/json", getCity: (d) => d.city }
    ];
    
    let city = null;
    
    for (const service of services) {
        try {
            const response = await fetch(service.url);
            if (!response.ok) continue;
            
            const data = await response.json();
            const detectedCity = service.getCity(data);
            
            if (detectedCity && detectedCity !== "null" && detectedCity !== "") {
                city = detectedCity;
                console.log(`✅ Город: ${city}`);
                break;
            }
        } catch (e) {}
    }
    
    if (city) {
        try {
            const weatherResponse = await fetch(
                `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric&lang=ru`
            );
            const weatherData = await weatherResponse.json();
            
            if (weatherData.cod === 200) {
                renderWeather(weatherData);
                return;
            }
        } catch (e) {}
    }
    
    loadDefaultWeather();
}

// Загрузка погоды по умолчанию
async function loadDefaultWeather() {
    showLoading("Загрузка погоды...");
    
    try {
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?q=Moscow&appid=${API_KEY}&units=metric&lang=ru`
        );
        const data = await response.json();
        renderWeather(data);
    } catch (error) {
        document.getElementById("weatherWidget").innerHTML = '<div class="loading-container"><p>Ошибка загрузки</p></div>';
    }
}

// Стили
const style = document.createElement('style');
style.textContent = `
    .loading-container {
        text-align: center;
        padding: 60px 20px;
    }
    .loading-spinner {
        width: 50px;
        height: 50px;
        border: 4px solid #e2e8f0;
        border-top-color: #667eea;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 16px;
    }
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    .loading-container p {
        color: #64748b;
    }
    .forecast-loading {
        text-align: center;
        padding: 20px;
        color: #64748b;
    }
    .weather-emoji {
        font-size: 72px;
        line-height: 1;
    }
    .forecast-emoji {
        font-size: 36px;
        margin: 8px 0;
    }
    .forecast-skeleton {
        display: flex;
        gap: 12px;
    }
    .forecast-card.skeleton {
        background: #f1f5f9;
    }
    .skeleton-line {
        height: 14px;
        background: #e2e8f0;
        border-radius: 4px;
        margin: 8px 0;
        animation: pulse 1.5s ease-in-out infinite;
    }
    .skeleton-icon {
        width: 48px;
        height: 48px;
        background: #e2e8f0;
        border-radius: 50%;
        margin: 8px auto;
        animation: pulse 1.5s ease-in-out infinite;
    }
    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }
`;
document.head.appendChild(style);

// ЗАПУСК
window.addEventListener("load", () => {
    console.log("🚀 Приложение запущено");
    loadWeatherByIP();
});

async function weather(city) {
    
    try{
        const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric`)

        const data = await response.json();
        document.getElementById("out1").value = `${Math.round(data.main.temp)}°C`;
        document.getElementById("out2").value = `${(data.main.temp_min)}°C`;
        document.getElementById("out3").value = `${Math.round(data.main.feels_like)}°C`;
       
    }
    catch (error) {
    
  }
}  
async function forecast(city) {
    
    try{
        const response = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${API_KEY}&units=metric&lang=ru`)

        const data = await response.json();
        console.log(data)
       
    }
    catch (error) {
    
  }
  
}
async function forecast(city) {
    
    try{
        const response = await fetch(``)

        const data = await response.json();
        
       
    }
    catch (error) {
    
  }
  
}
