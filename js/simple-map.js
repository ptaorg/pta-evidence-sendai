(function(){
  const DATA = window.PTA_BOARD_RESPONSE_INDEX || {};
  const municipalities = Array.isArray(DATA.municipalities) ? DATA.municipalities : [];
  const bbox = { minLon: 122, maxLon: 146.5, minLat: 24, maxLat: 46.8 };
  const state = { type: 'all', query: '', selected: null };

  const esc = (value) => String(value ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
  const typeLabel = (key) => DATA.typeMap?.[key]?.label || key;
  const typeTitle = (key) => DATA.typeMap?.[key]?.title || key;
  const flags = (item) => Array.isArray(item?.qualityFlags) ? item.qualityFlags : [];
  const tags = (item) => Array.isArray(item?.usefulTags) ? item.usefulTags : [];
  const flagText = (item) => flags(item).map(f => `${f.key} ${f.label}`).join(' ');
  const tagText = (item) => tags(item).map(t => `${t.key} ${t.label}`).join(' ');
  const flagPills = (item) => flags(item).map(f => `<span class="quality-pill quality-pill--${esc(f.key)}">${esc(f.label)}</span>`).join('');
  const tagPills = (item) => tags(item).slice(0, 6).map(t => `<span class="topic-tag topic-tag--${esc(t.key)}">${esc(t.label)}</span>`).join('');

  function coordinates(item){
    if (!Array.isArray(item?.coordinates) || item.coordinates.length < 2) return null;
    const lat = Number(item.coordinates[0]);
    const lon = Number(item.coordinates[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  }

  function project(item){
    const c = coordinates(item);
    if (!c) return null;
    const x = ((c.lon - bbox.minLon) / (bbox.maxLon - bbox.minLon)) * 100;
    const y = (1 - ((c.lat - bbox.minLat) / (bbox.maxLat - bbox.minLat))) * 100;
    return {
      x: Math.max(2, Math.min(98, x)),
      y: Math.max(2, Math.min(98, y))
    };
  }

  function matches(item){
    const byType = state.type === 'all' || (item.types || []).includes(state.type);
    const q = state.query.trim();
    const haystack = [
      item.municipality,
      item.no,
      ...(item.types || []),
      item.firstBody,
      flagText(item),
      tagText(item)
    ].join(' ');
    return byType && (!q || haystack.includes(q));
  }

  function renderSummary(){
    const el = document.getElementById('mapSummaryStats');
    if (!el) return;
    const withCoordinates = municipalities.filter(coordinates).length;
    const detailCount = Array.isArray(DATA.details) ? DATA.details.length : 0;
    const dateMissing = DATA.qualitySummary?.flagCounts?.dateMissing || 0;
    const tagged = DATA.usefulTagSummary?.taggedDetails || 0;
    el.innerHTML = `
      <div class="board-stat"><div class="board-stat__num">${esc(DATA.totalMunicipalities || municipalities.length)}</div><div class="board-stat__label">自治体索引数</div></div>
      <div class="board-stat"><div class="board-stat__num">${esc(detailCount)}</div><div class="board-stat__label">回答本文レコード</div></div>
      <div class="board-stat"><div class="board-stat__num">${esc(withCoordinates)}</div><div class="board-stat__label">概略座標あり</div></div>
      <div class="board-stat"><div class="board-stat__num">${esc(dateMissing)}</div><div class="board-stat__label">回答日未確認</div></div>
      <div class="board-stat"><div class="board-stat__num">${esc(tagged)}</div><div class="board-stat__label">論点タグ付</div></div>`;
  }

  function renderFilters(){
    const row = document.getElementById('mapTypeFilters');
    if (!row) return;
    const types = Object.entries(DATA.typeMap || {}).filter(([key]) => (DATA.typeCounts?.[key] || 0) > 0);
    row.innerHTML = `<button class="is-active" data-map-type="all">すべて</button>` + types.map(([key, info]) => {
      return `<button data-map-type="${esc(key)}"><strong>${esc(key)}</strong> ${esc(info.label || key)} <small>${esc(DATA.typeCounts?.[key] || 0)}</small></button>`;
    }).join('');
    row.querySelectorAll('[data-map-type]').forEach((button) => {
      button.addEventListener('click', () => {
        state.type = button.dataset.mapType || 'all';
        row.querySelectorAll('[data-map-type]').forEach(b => b.classList.remove('is-active'));
        button.classList.add('is-active');
        renderMap();
      });
    });
  }

  function selectedOrDefault(items){
    if (state.selected) {
      const found = items.find(item => String(item.no) === String(state.selected));
      if (found) return found;
    }
    return items[0] || null;
  }

  function renderPanel(item, total){
    const panel = document.getElementById('simpleMapPanel');
    if (!panel) return;
    if (!item) {
      panel.innerHTML = `<strong>該当する自治体がありません</strong><p>検索語または類型フィルタを変更してください。</p>`;
      return;
    }
    state.selected = item.no;
    const typeList = (item.types || []).map(k => `<span class="type-pill" title="${esc(typeTitle(k))}">${esc(typeLabel(k))}</span>`).join('');
    const q = encodeURIComponent(item.municipality || '');
    const excerpt = esc((item.firstBody || '本文冒頭は登録されていません。').replace(/\s+/g, ' ').slice(0, 360));
    panel.innerHTML = `
      <div class="map-panel-kicker">表示対象 ${esc(total)}件中</div>
      <h2>${esc(item.municipality)}</h2>
      <div class="map-panel-meta">回答本文 ${esc(item.detailCount || 0)}件｜${esc(item.coordinateNote || '概略座標')}</div>
      <div class="map-panel-pills">${typeList || '<span class="muted">類型未登録</span>'}</div>
      <div class="topic-tag-row">${tagPills(item) || '<span class="muted">論点タグ未登録</span>'}</div>
      <div class="quality-pill-row">${flagPills(item) || '<span class="muted">検証フラグなし</span>'}</div>
      <p>${excerpt}</p>
      <a class="mini-link" href="responses.html?q=${q}#response-details">回答DBで本文を確認する</a>`;
  }

  function renderList(items){
    const list = document.getElementById('simpleMapList');
    const count = document.getElementById('simpleMapListCount');
    if (count) count.textContent = `${items.length}件`;
    if (!list) return;
    list.innerHTML = items.map(item => {
      const typeShort = (item.types || []).map(k => `<span class="municipality-type-chip">${esc(k)}</span>`).join('');
      return `<button class="map-list-row${String(item.no) === String(state.selected) ? ' is-active' : ''}" data-map-select="${esc(item.no)}">
        <span class="map-list-row__name">${esc(item.municipality)}</span>
        <span class="map-list-row__meta">本文 ${esc(item.detailCount || 0)}件 ${typeShort}</span>
      </button>`;
    }).join('');
    list.querySelectorAll('[data-map-select]').forEach(button => {
      button.addEventListener('click', () => {
        state.selected = button.dataset.mapSelect;
        renderMap();
      });
    });
  }

  function renderMap(){
    const map = document.getElementById('simpleResponseMap');
    if (!map) return;
    const items = municipalities.filter(matches);
    const plotted = items.filter(project);
    const selected = selectedOrDefault(plotted.length ? plotted : items);
    if (selected) state.selected = selected.no;
    map.innerHTML = `
      <div class="map-axis map-axis--north">北</div>
      <div class="map-axis map-axis--south">南</div>
      <div class="map-axis map-axis--west">西</div>
      <div class="map-axis map-axis--east">東</div>
      <div class="map-caption">自治体所在地の概略座標を簡易投影しています。行政区域や正確な地理情報ではありません。</div>`;
    plotted.forEach(item => {
      const p = project(item);
      const button = document.createElement('button');
      button.className = 'map-dot' + (String(item.no) === String(state.selected) ? ' is-active' : '');
      button.type = 'button';
      button.style.left = `${p.x}%`;
      button.style.top = `${p.y}%`;
      button.dataset.mapSelect = item.no;
      button.title = `${item.municipality}｜本文 ${item.detailCount || 0}件`;
      button.setAttribute('aria-label', button.title);
      button.innerHTML = `<span>${esc(item.municipality)}</span>`;
      button.addEventListener('click', () => { state.selected = item.no; renderMap(); });
      map.appendChild(button);
    });
    renderPanel(selected, items.length);
    renderList(items);
  }

  function init(){
    renderSummary();
    renderFilters();
    const input = document.getElementById('simpleMapSearch');
    if (input) {
      input.addEventListener('input', () => {
        state.query = input.value.trim();
        state.selected = null;
        renderMap();
      });
    }
    renderMap();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
