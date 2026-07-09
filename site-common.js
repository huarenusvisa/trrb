(function () {
  const CATEGORY_PLACEHOLDERS = {
    "重要新闻": "./assets/category-placeholders/important.svg",
    "热门头条": "./assets/category-placeholders/hot.svg",
    "驱逐快报": "./assets/category-placeholders/deport.svg",
    "美国时政": "./assets/category-placeholders/politics.svg",
    "美国警情": "./assets/category-placeholders/crime.svg",
    "中国官场": "./assets/category-placeholders/china.svg",
    "移民美国": "./assets/category-placeholders/immigration.svg",
    "庇护百科": "./assets/category-placeholders/asylum.svg",
    "深度专题": "./assets/category-placeholders/deep.svg",
    "default": "./assets/category-placeholders/generic.svg"
  };

  function categoryPlaceholder(category) {
    return CATEGORY_PLACEHOLDERS[category] || CATEGORY_PLACEHOLDERS.default;
  }

  function normalizeImageUrl(value, category) {
    const text = String(value || '').replaceAll('\u0026', '&').trim();
    if (!text || text.includes('image-placeholder.svg')) return categoryPlaceholder(category);
    if (text.startsWith('/assets/news-images/')) return '.' + text;
    if (text.startsWith('assets/news-images/')) return './' + text;
    return text.replace(/^https?:\/\/(?:www\.)?trrb\.net\/wp-content\/uploads\//, './assets/news-images/');
  }

  function weatherInfo(code) {
    const map = {
      0: ['☀️', '晴'], 1: ['🌤️', '晴间多云'], 2: ['⛅', '多云'], 3: ['☁️', '阴'],
      45: ['🌫️', '有雾'], 48: ['🌫️', '雾凇'], 51: ['🌦️', '毛毛雨'], 53: ['🌦️', '小雨'],
      55: ['🌦️', '细雨'], 61: ['🌧️', '小雨'], 63: ['🌧️', '中雨'], 65: ['🌧️', '大雨'],
      71: ['🌨️', '小雪'], 73: ['🌨️', '中雪'], 75: ['❄️', '大雪'], 80: ['🌧️', '阵雨'],
      81: ['🌧️', '阵雨'], 82: ['⛈️', '强阵雨'], 95: ['⛈️', '雷暴'], 96: ['⛈️', '雷暴夹冰雹'],
      99: ['⛈️', '强雷暴']
    };
    return map[code] || ['🌤️', '天气'];
  }

  function chineseWeekday(date, timeZone) {
    return new Intl.DateTimeFormat('zh-CN', { weekday: 'short', timeZone }).format(date).replace('周', '周');
  }

  function formatDate(date, timeZone) {
    const parts = new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      timeZone
    }).formatToParts(date);
    const get = (type) => parts.find((item) => item.type === type)?.value || '';
    return `${get('month')}月${get('day')}日 ${get('weekday')}`;
  }

  function normalizeLocationName(loc) {
    if (!loc) return '本地';
    const raw = String(loc);
    const mapping = {
      'new york': '纽约', 'los angeles': '洛杉矶', 'san francisco': '旧金山', 'flushing': '法拉盛',
      'queens': '皇后区', 'brooklyn': '布鲁克林', 'manhattan': '曼哈顿', 'boston': '波士顿',
      'chicago': '芝加哥', 'miami': '迈阿密', 'houston': '休斯敦', 'seattle': '西雅图',
      'washington': '华盛顿', 'atlanta': '亚特兰大', 'philadelphia': '费城', 'dallas': '达拉斯'
    };
    const key = raw.toLowerCase();
    if (mapping[key]) return mapping[key];
    return raw;
  }

  async function updateTopbar() {
    const locationEl = document.querySelector('.meta-location');
    const dateEl = document.querySelector('.meta-date');
    const weatherEl = document.querySelector('.meta-weather');
    if (!locationEl || !dateEl || !weatherEl) return;

    const fallbackTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
    const state = { city: '本地', timeZone: fallbackTimeZone };

    function renderDate() {
      dateEl.textContent = formatDate(new Date(), state.timeZone || fallbackTimeZone);
    }

    locationEl.textContent = `📍 ${state.city}`;
    renderDate();
    setInterval(renderDate, 60000);

    try {
      const geoResponse = await fetch('https://ipwho.is/', { cache: 'no-store' });
      const geo = await geoResponse.json();
      if (geo && geo.success !== false) {
        state.city = normalizeLocationName(geo.city || geo.region || geo.country || '本地');
        if (geo.timezone && geo.timezone.id) state.timeZone = geo.timezone.id;
        locationEl.textContent = `📍 ${state.city}`;
        renderDate();
        if (typeof geo.latitude === 'number' && typeof geo.longitude === 'number') {
          const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current=temperature_2m,weather_code&temperature_unit=celsius`, { cache: 'no-store' });
          const weather = await weatherResponse.json();
          const current = weather && weather.current ? weather.current : null;
          if (current) {
            const temperature = Math.round(Number(current.temperature_2m));
            const [icon, label] = weatherInfo(current.weather_code);
            weatherEl.textContent = `${icon} ${temperature}°C ${label}`;
          }
        }
      }
    } catch (error) {
      // keep fallback values quietly
    }
  }

  window.TRRB_getImageUrl = normalizeImageUrl;
  window.TRRB_categoryPlaceholder = categoryPlaceholder;
  window.TRRB_updateTopbar = updateTopbar;
  document.addEventListener('DOMContentLoaded', updateTopbar, { once: true });
})();
