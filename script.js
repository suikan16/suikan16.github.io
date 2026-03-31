const API_KEY = "c2f9cfdd2cb513c0f812f89130d91f2b";


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

// Отображение погоды
function renderWeather(data) {
    const widget = document.getElementById("weatherWidget");
    
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
                <img src="https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png" alt="погода">
                <div class="weather-description">${data.weather[0].description}</div>
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
    loadForecast(data.name);
}

// Загрузка прогноза
async function loadForecast(city) {
    try {
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${API_KEY}&units=metric&lang=ru`
        );
        const data = await response.json();
        
        if (data.cod === "200") {
            const dailyForecasts = {};
            
            data.list.forEach(item => {
                const date = item.dt_txt.split(' ')[0];
                if (!dailyForecasts[date]) {
                    dailyForecasts[date] = {
                        date: date,
                        temps: [],
                        tempMins: [],
                        tempMaxs: [],
                        icons: []
                    };
                }
                dailyForecasts[date].temps.push(item.main.temp);
                dailyForecasts[date].tempMins.push(item.main.temp_min);
                dailyForecasts[date].tempMaxs.push(item.main.temp_max);
                dailyForecasts[date].icons.push(item.weather[0].icon);
            });
            
            const forecastList = Object.values(dailyForecasts).slice(0, 5).map(day => ({
                date: day.date,
                temp_avg: Math.round(day.temps.reduce((a, b) => a + b, 0) / day.temps.length),
                temp_min: Math.round(Math.min(...day.tempMins)),
                temp_max: Math.round(Math.max(...day.tempMaxs)),
                icon: day.icons[Math.floor(day.icons.length / 2)]
            }));
            
            const container = document.getElementById("forecastContainer");
            const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
            
            container.innerHTML = forecastList.map(day => {
                const date = new Date(day.date);
                const dayName = days[date.getDay()];
                const dayMonth = `${date.getDate()}.${date.getMonth() + 1}`;
                return `
                    <div class="forecast-card">
                        <div class="day">${dayName}</div>
                        <div class="date">${dayMonth}</div>
                        <img src="https://openweathermap.org/img/wn/${day.icon}.png" alt="">
                        <div class="temp">${day.temp_avg}°</div>
                        <div class="temp-range">${day.temp_min}° / ${day.temp_max}°</div>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error("Ошибка прогноза:", error);
        const container = document.getElementById("forecastContainer");
        if (container) {
            container.innerHTML = '<div class="forecast-loading">Не удалось загрузить прогноз</div>';
        }
    }
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

// ========== ОПРЕДЕЛЕНИЕ ПО IP (ВМЕСТО ГЕОЛОКАЦИИ) ==========

// Загрузка погоды по IP (основной способ)
async function loadWeatherByIP() {
    showLoading("Определяем ваш город по IP...");
    
    try {
        // Пробуем несколько сервисов для надёжности
        let city = null;
        let country = null;
        
        // Сервис 1: ipapi.co (самый быстрый)
        try {
            const response = await fetch('https://ipapi.co/json/');
            const data = await response.json();
            if (data.city) {
                city = data.city;
                country = data.country_name;
                console.log(`✅ Город определён через ipapi: ${city}, ${country}`);
            }
        } catch (e) {
            console.log("ipapi не ответил, пробуем следующий");
        }
        
        // Сервис 2: ipwho.is (запасной)
        if (!city) {
            try {
                const response = await fetch('https://ipwho.is/');
                const data = await response.json();
                if (data.city) {
                    city = data.city;
                    country = data.country;
                    console.log(`✅ Город определён через ipwho: ${city}, ${country}`);
                }
            } catch (e) {
                console.log("ipwho не ответил");
            }
        }
        
        // Сервис 3: freegeoip.app (ещё один запасной)
        if (!city) {
            try {
                const response = await fetch('https://freegeoip.app/json/');
                const data = await response.json();
                if (data.city) {
                    city = data.city;
                    country = data.country_name;
                    console.log(`✅ Город определён через freegeoip: ${city}, ${country}`);
                }
            } catch (e) {
                console.log("freegeoip не ответил");
            }
        }
        
        // Если город определился, загружаем погоду
        if (city) {
            showLoading(`Город: ${city}, загружаем погоду...`);
            
            const weatherResponse = await fetch(
                `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric&lang=ru`
            );
            const weatherData = await weatherResponse.json();
            
            if (weatherData.cod === 200) {
                renderWeather(weatherData);
                return;
            }
        }
        
        // Если ничего не сработало, показываем Москву
        console.log("⚠️ Не удалось определить город, показываем Москву");
        loadDefaultWeather();
        
    } catch (error) {
        console.error("❌ Ошибка определения по IP:", error);
        loadDefaultWeather();
    }
}

// Загрузка погоды по умолчанию (Москва)
async function loadDefaultWeather() {
    showLoading("Загрузка погоды...");
    
    try {
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?q=Moscow&appid=${API_KEY}&units=metric&lang=ru`
        );
        const data = await response.json();
        renderWeather(data);
    } catch (error) {
        console.error("Ошибка:", error);
        document.getElementById("weatherWidget").innerHTML = '<div class="loading-container"><p>Ошибка загрузки погоды. Проверьте интернет.</p></div>';
    }
}

// Добавляем стили
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
`;
document.head.appendChild(style);

// ЗАПУСК ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
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
