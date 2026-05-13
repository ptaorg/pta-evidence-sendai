(() => {
  const form = document.getElementById('siteSearchForm');
  const input = document.getElementById('siteSearchInput');
  const results = document.getElementById('siteSearchResults');
  const count = document.getElementById('siteSearchCount');
  const filterButtons = Array.from(document.querySelectorAll('[data-search-kind]'));
  let entries = [];
  let currentKind = 'all';

  function normalize(value) {
    return (value || '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return (value || '').toString().replace(/[&<>"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
  }

  function highlight(text, terms) {
    let out = escapeHtml(text || '');
    for (const term of terms.filter((t) => t.length >= 2).slice(0, 5)) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`(${escaped})`, 'ig'), '<mark>$1</mark>');
    }
    return out;
  }

  function scoreEntry(entry, terms) {
    const title = normalize(entry.title);
    const desc = normalize(entry.description);
    const snip = normalize(entry.snippet);
    const category = normalize(entry.category);
    const hay = normalize([entry.title, entry.description, entry.snippet, entry.category, entry.kind].join(' '));
    let score = 0;
    for (const term of terms) {
      if (!term) continue;
      if (title === term) score += 24;
      if (title.includes(term)) score += 12;
      if (category.includes(term)) score += 8;
      if (desc.includes(term)) score += 6;
      if (snip.includes(term)) score += 3;
      if (hay.includes(term)) score += 1;
    }
    if (entry.kind === 'response') score += 1;
    return score;
  }

  function filteredEntries() {
    if (currentKind === 'all') return entries;
    return entries.filter((entry) => entry.kind === currentKind);
  }

  function updateFilterUi() {
    filterButtons.forEach((button) => {
      const active = button.dataset.searchKind === currentKind;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function kindLabel(kind) {
    if (kind === 'response') return '回答DB本文';
    if (kind === 'page') return 'サイトページ';
    return kind || 'ページ';
  }

  function runSearch(query, updateUrl = true) {
    const q = normalize(query);
    if (updateUrl) {
      const url = new URL(window.location.href);
      if (q) url.searchParams.set('q', query.trim()); else url.searchParams.delete('q');
      if (currentKind !== 'all') url.searchParams.set('kind', currentKind); else url.searchParams.delete('kind');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    const pool = filteredEntries();
    if (!q) {
      const suffix = currentKind === 'all' ? '' : `（${kindLabel(currentKind)}のみ）`;
      count.textContent = `${pool.length}件を検索対象にしています${suffix}。検索語を入力してください。`;
      results.innerHTML = '';
      return;
    }
    const terms = q.split(' ').filter(Boolean);
    const ranked = pool.map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, 'ja'))
      .slice(0, 80);

    count.textContent = `${ranked.length}件を表示しています。正式な引用では、検索結果から本文へ進み、原資料・回答日・添付資料を確認してください。`;
    if (!ranked.length) {
      results.innerHTML = '<p class="note-box">該当する検索結果がありません。表記を変える、検索対象を「すべて」に戻す、又は「入会」「会費」「名簿」「137条」など短い語で再検索してください。</p>';
      return;
    }
    results.innerHTML = ranked.map(({entry}) => `
      <article class="search-result-card search-result-card--${escapeHtml(entry.kind || 'page')}">
        <div class="search-result-card__meta"><span>${escapeHtml(kindLabel(entry.kind))}</span><span>${escapeHtml(entry.category || '未分類')}</span></div>
        <h3><a href="${escapeHtml(entry.url)}">${highlight(entry.title, terms)}</a></h3>
        <p>${highlight(entry.description || entry.snippet || '', terms)}</p>
        ${entry.snippet && entry.description !== entry.snippet ? `<p class="search-result-snippet">${highlight(entry.snippet, terms)}</p>` : ''}
        <small>${escapeHtml(entry.url)}</small>
      </article>
    `).join('');
  }

  async function loadIndex() {
    try {
      const response = await fetch('data/page-index.json', { cache: 'no-store' });
      const data = await response.json();
      entries = Array.isArray(data.pages) ? data.pages : [];
      const params = new URLSearchParams(window.location.search);
      const initialKind = params.get('kind');
      if (['all', 'page', 'response'].includes(initialKind)) currentKind = initialKind;
      updateFilterUi();
      const initial = params.get('q') || '';
      if (initial) input.value = initial;
      runSearch(initial, false);
    } catch (error) {
      count.textContent = '検索インデックスを読み込めませんでした。';
      results.innerHTML = '<p class="note-box">data/page-index.json の配置を確認してください。</p>';
    }
  }

  if (!form || !input || !results || !count) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runSearch(input.value);
  });

  input.addEventListener('input', () => {
    runSearch(input.value);
  });

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      currentKind = button.dataset.searchKind || 'all';
      updateFilterUi();
      runSearch(input.value);
    });
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-search-term]');
    if (!button) return;
    input.value = button.dataset.searchTerm || '';
    input.focus();
    runSearch(input.value);
  });

  loadIndex();
})();
