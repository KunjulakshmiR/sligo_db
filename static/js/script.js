// ── Global state ──────────────────────────────────────────────────────────────
const CELL_LINES = ["HEK293", "A-375", "A-549", "HeLa", "JURKAT", "K-562"];
const ALL_COLS   = [...CELL_LINES, "general"];

let currentPage    = 1;
let resultsPerPage = 25;
let allResults     = [];
let lastSearch     = {};
let currentSort    = { field: 'confidence_score', order: 'desc' };
let searchMode     = 'single';   // 'single' | 'pair'
let activeTab      = 'home';

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {

    // Enter-key support
    const enterIds = [
        'geneInput', 'minConfidenceInput', 'maxConfidenceInput',
        'geneInputSearchTab', 'minConfidenceInputSearchTab', 'maxConfidenceInputSearchTab',
    ];
    enterIds.forEach(id => {
        document.getElementById(id).addEventListener('keypress', e => {
            if (e.key === 'Enter') searchSLPartners();
        });
    });

    // Pagination
    document.getElementById('firstBtn').addEventListener('click', goToFirstPage);
    document.getElementById('prevBtn').addEventListener('click', prevPage);
    document.getElementById('nextBtn').addEventListener('click', nextPage);
    document.getElementById('lastBtn').addEventListener('click', goToLastPage);

    // Search mode toggle
    document.getElementById('toggleSearchMode').addEventListener('click', toggleSearchMode);
    document.getElementById('toggleSearchModeSearchTab').addEventListener('click', toggleSearchMode);

    // Gene autocomplete
    setupAutocomplete('geneInput');
    setupAutocomplete('geneInputSearchTab');

    // Close modal on outside click
    window.addEventListener('click', e => {
        if (e.target === document.getElementById('downloadModal')) closeModal();
    });
});

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');
    document.querySelector(`.tab-btn[onclick="switchTab('${tabName}')"]`).classList.add('active');

    if (tabName === 'home') {
        document.getElementById('results').innerHTML = '';
        document.getElementById('pagination').style.display = 'none';
        document.getElementById('downloadBtn').disabled = true;
        document.getElementById('downloadBtnSearchTab').disabled = true;
    }
    activeTab = tabName;
}

// ── Autocomplete ──────────────────────────────────────────────────────────────
function setupAutocomplete(inputId, endpoint = '/api/genes') {
    const input = document.getElementById(inputId);

    input.addEventListener('input', function () {
        const val = this.value;
        if (val.length < 2) { closeAllLists(); return; }

        fetch(`${endpoint}?q=${encodeURIComponent(val)}`)
            .then(r => r.json())
            .then(suggestions => {
                closeAllLists();
                if (!suggestions.length) return;

                const list = document.createElement('DIV');
                list.className = 'autocomplete-items';
                this.parentNode.appendChild(list);

                suggestions.forEach(item => {
                    const div = document.createElement('DIV');
                    div.innerHTML = `<strong>${item.substring(0, val.length)}</strong>${item.substring(val.length)}`;
                    div.innerHTML += `<input type='hidden' value='${item}'>`;
                    div.addEventListener('click', () => { input.value = item; closeAllLists(); });
                    list.appendChild(div);
                });
            });
    });

    input.addEventListener('keydown', function (e) {
        const items = document.getElementsByClassName('autocomplete-items')[0];
        if (!items) return;
        let active = items.getElementsByClassName('autocomplete-active')[0];

        if (e.keyCode === 40) {          // ↓
            e.preventDefault();
            if (!active) { items.firstElementChild?.classList.add('autocomplete-active'); }
            else if (active.nextElementSibling) {
                active.classList.remove('autocomplete-active');
                active.nextElementSibling.classList.add('autocomplete-active');
            }
        } else if (e.keyCode === 38) {   // ↑
            e.preventDefault();
            if (active?.previousElementSibling) {
                active.classList.remove('autocomplete-active');
                active.previousElementSibling.classList.add('autocomplete-active');
            }
        } else if (e.keyCode === 13 && active) {
            e.preventDefault();
            active.click();
        }
    });
}

function closeAllLists() {
    document.querySelectorAll('.autocomplete-items').forEach(el => el.remove());
}

// ── Search mode toggle ────────────────────────────────────────────────────────
function toggleSearchMode() {
    document.getElementById('results').innerHTML = '';
    document.getElementById('pagination').style.display = 'none';
    document.getElementById('status').textContent = '';
    document.getElementById('statusSearchTab').textContent = '';
    document.getElementById('downloadBtn').disabled = true;
    document.getElementById('downloadBtnSearchTab').disabled = true;
    allResults = [];
    lastSearch = {};

    if (searchMode === 'single') {
        searchMode = 'pair';
        document.getElementById('singleGeneForm').style.display = 'none';
        document.getElementById('genePairForm').style.display = 'block';
        document.getElementById('singleGeneFormSearchTab').style.display = 'none';
        document.getElementById('genePairFormSearchTab').style.display = 'block';
        document.getElementById('searchTitle').innerHTML = '<i class="fas fa-search" style="margin-right: 10px;"></i>Search by Gene Pair';
        document.getElementById('searchTitleSearchTab').innerHTML = '<i class="fas fa-search" style="margin-right: 10px;"></i>Search by Gene Pair';
        document.getElementById('toggleSearchMode').innerHTML = '<i class="fas fa-exchange-alt"></i> Search Single Gene';
        document.getElementById('toggleSearchModeSearchTab').innerHTML = '<i class="fas fa-exchange-alt"></i> Search Single Gene';
        document.getElementById('geneInput').value = '';
        document.getElementById('geneInputSearchTab').value = '';
    } else {
        searchMode = 'single';
        document.getElementById('singleGeneForm').style.display = 'block';
        document.getElementById('genePairForm').style.display = 'none';
        document.getElementById('singleGeneFormSearchTab').style.display = 'block';
        document.getElementById('genePairFormSearchTab').style.display = 'none';
        document.getElementById('searchTitle').innerHTML = '<i class="fas fa-search" style="margin-right: 10px;"></i>Search SL Partners';
        document.getElementById('searchTitleSearchTab').innerHTML = '<i class="fas fa-search" style="margin-right: 10px;"></i>Search SL Partners';
        document.getElementById('toggleSearchMode').innerHTML = '<i class="fas fa-exchange-alt"></i> Search by Gene Pair';
        document.getElementById('toggleSearchModeSearchTab').innerHTML = '<i class="fas fa-exchange-alt"></i> Search by Gene Pair';
        document.getElementById('genePairsInput').value = '';
        document.getElementById('genePairsInputSearchTab').value = '';
    }
}

// ── Main search ───────────────────────────────────────────────────────────────
async function searchSLPartners() {
    document.getElementById('results').innerHTML = '';
    document.getElementById('pagination').style.display = 'none';
    document.getElementById('status').textContent = '';
    document.getElementById('statusSearchTab').textContent = '';
    document.getElementById('downloadBtn').disabled = true;
    document.getElementById('downloadBtnSearchTab').disabled = true;
    allResults = [];

    try {
        document.getElementById('loading').style.display = 'block';
        document.getElementById('loadingSearchTab').style.display = 'block';

        if (searchMode === 'single') {
            // ── Single gene ──
            const isHome   = activeTab === 'home';
            const gene     = document.getElementById(isHome ? 'geneInput' : 'geneInputSearchTab').value.trim();
            const column   = document.getElementById(isHome ? 'cellLineSelect' : 'cellLineSelectSearchTab').value;
            const minConf  = parseFloat(document.getElementById(isHome ? 'minConfidenceInput' : 'minConfidenceInputSearchTab').value);
            const maxConf  = parseFloat(document.getElementById(isHome ? 'maxConfidenceInput' : 'maxConfidenceInputSearchTab').value);

            if (!gene) throw new Error('Please enter a gene name');
            if (minConf > maxConf) throw new Error('Minimum confidence cannot exceed maximum');

            lastSearch = { gene, column, minConf, maxConf };

            const params = new URLSearchParams({
                gene, column,
                min_confidence: minConf,
                max_confidence: maxConf,
            });
            const data = await fetch(`/search?${params}`).then(r => r.json());
            if (data.error) throw new Error(data.error);

            allResults = data.results;
            updateStatus(data);

        } else {
            // ── Pair search ──
            const isHome       = activeTab === 'home';
            const rawText      = document.getElementById(isHome ? 'genePairsInput' : 'genePairsInputSearchTab').value.trim();

            if (!rawText) throw new Error('Please enter gene pairs to search for');

            const genePairs = [];
            rawText.split('\n').forEach(line => {
                const parts = line.split(',').map(g => g.trim());
                if (parts.length === 2 && parts[0] && parts[1]) {
                    genePairs.push({ gene1: parts[0].toUpperCase(), gene2: parts[1].toUpperCase() });
                }
            });

            if (!genePairs.length) throw new Error('No valid gene pairs found. Use format: Gene1,Gene2');

            lastSearch = { gene_pairs: genePairs };

	    const params = new URLSearchParams();
	    genePairs.forEach(p => params.append('pairs', `${p.gene1},${p.gene2}`));
	    const data = await fetch(`/search_pairs?${params}`).then(r => r.json());

            if (data.error) throw new Error(data.error);

            allResults = data.results;
            updateStatus(data);
        }

        if (allResults.length > 0) {
            currentPage = 1;
            if (searchMode === 'single') sortResults();
            displayResultsPage();
            document.getElementById('downloadBtn').disabled = false;
            document.getElementById('downloadBtnSearchTab').disabled = false;
            switchTab('search');
        } else {
            document.getElementById('results').innerHTML =
                `<div class="no-results">No results found matching your criteria</div>`;
        }

    } catch (error) {
        console.error('Search error:', error);
        showError(error);
    } finally {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('loadingSearchTab').style.display = 'none';
    }
}

// ── Sorting (single-gene only) ────────────────────────────────────────────────
function sortResults() {
    allResults.sort((a, b) => {
        const valA = a[currentSort.field] ?? -Infinity;
        const valB = b[currentSort.field] ?? -Infinity;
        if (valA < valB) return currentSort.order === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.order === 'asc' ? 1  : -1;
        return 0;
    });
}

function changeSort(field) {
    if (field === currentSort.field) {
        currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.order = field === 'confidence_score' ? 'desc' : 'asc';
    }
    sortResults();
    displayResultsPage();
}

// ── Display ───────────────────────────────────────────────────────────────────
function displayResultsPage() {
    const start       = (currentPage - 1) * resultsPerPage;
    const pageResults = allResults.slice(start, start + resultsPerPage);

    const ind = f => f === currentSort.field ? (currentSort.order === 'desc' ? ' ▼' : ' ▲') : '';

    let html = `<h3><i class="fas fa-list" style="color: var(--accent-color); margin-right: 10px;"></i>${allResults.length} Result${allResults.length !== 1 ? 's' : ''} Found</h3>`;

    if (searchMode === 'single') {
        // ── Single-gene table: Gene1 | Gene2 | Confidence | Source ──
        html += `
        <table class="results-table">
            <thead><tr>
                <th class="sortable" onclick="changeSort('gene1')">Gene 1${ind('gene1')}</th>
                <th class="sortable" onclick="changeSort('gene2')">Gene 2${ind('gene2')}</th>
                <th class="sortable" onclick="changeSort('confidence_score')">Confidence Score${ind('confidence_score')}</th>
                <th>Source</th>
            </tr></thead>
            <tbody>`;

        pageResults.forEach(r => {
            html += `<tr>
                <td>${r.gene1}</td>
                <td>${r.gene2}</td>
                <td>${r.confidence_score.toFixed(5)}</td>
                <td>${r.source}</td>
            </tr>`;
        });

    } else {
        // ── Pair table: Gene1 | Gene2 | HEK293 | A-375 | A-549 | HeLa | JURKAT | K-562 | General ──
        const fmtPair = v => {
            if (v === null || v === undefined) return 'N/A';
            if (v === 1.0) return '<span class="label-sl">SL</span>';
            if (v === 0.0) return '<span class="label-nsl">NSL</span>';
            return v.toFixed(5);
        };

        html += `
        <div class="pair-note">
            <i class="fas fa-info-circle"></i>
            <strong>SL</strong> = Synthetic Lethal &nbsp;|&nbsp; <strong>NSL</strong> = Non-Synthetic Lethal.
            Absolute values (SL / NSL) are sourced from <strong>SynLethDB</strong>.
        </div>
        <div style="overflow-x:auto;">
        <table class="results-table pair-table">
            <thead><tr>
                <th>Gene 1</th>
                <th>Gene 2</th>
                ${CELL_LINES.map(cl => `<th>${cl}</th>`).join('')}
                <th>General</th>
            </tr></thead>
            <tbody>`;

        pageResults.forEach(r => {
            html += `<tr>
                <td>${r.gene1}</td>
                <td>${r.gene2}</td>
                ${CELL_LINES.map(cl => `<td>${fmtPair(r[cl])}</td>`).join('')}
                <td>${fmtPair(r['general'])}</td>
            </tr>`;
        });

        html += `</tbody></table></div>`;
    }

    if (searchMode === 'single') html += `</tbody></table>`;

    document.getElementById('results').innerHTML = html;
    updatePagination();
}

// ── Pagination ────────────────────────────────────────────────────────────────
function changePageSize() {
    resultsPerPage = parseInt(document.getElementById('resultsPerPage').value);
    currentPage = 1;
    displayResultsPage();
}

function updatePagination() {
    const totalPages = Math.ceil(allResults.length / resultsPerPage);
    document.getElementById('pagination').style.display = totalPages > 1 ? 'flex' : 'none';

    document.getElementById('firstBtn').disabled = currentPage === 1;
    document.getElementById('prevBtn').disabled  = currentPage === 1;
    document.getElementById('nextBtn').disabled  = currentPage === totalPages;
    document.getElementById('lastBtn').disabled  = currentPage === totalPages;

    const container = document.getElementById('pageButtons');
    container.innerHTML = '';
    const max = 5;
    let s = Math.max(1, currentPage - Math.floor(max / 2));
    let e = Math.min(totalPages, s + max - 1);
    if (e - s + 1 < max) s = Math.max(1, e - max + 1);

    for (let i = s; i <= e; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.className = `page-button ${i === currentPage ? 'active' : ''}`;
        btn.addEventListener('click', () => goToPage(i));
        container.appendChild(btn);
    }
}

function prevPage()      { if (currentPage > 1) { currentPage--; displayResultsPage(); scrollToResults(); } }
function nextPage()      { const t = Math.ceil(allResults.length / resultsPerPage); if (currentPage < t) { currentPage++; displayResultsPage(); scrollToResults(); } }
function goToFirstPage() { currentPage = 1; displayResultsPage(); scrollToResults(); }
function goToLastPage()  { currentPage = Math.ceil(allResults.length / resultsPerPage); displayResultsPage(); scrollToResults(); }
function goToPage(n)     { currentPage = n; displayResultsPage(); scrollToResults(); }
function scrollToResults() { window.scrollTo({ top: document.getElementById('results').offsetTop - 20, behavior: 'smooth' }); }

// ── Status ────────────────────────────────────────────────────────────────────
function updateStatus(data) {
    let txt;
    if (searchMode === 'single') {
        const col = lastSearch.column === 'general' ? 'General model' : lastSearch.column;
        txt = `<i class="fas fa-info-circle" style="margin-right:8px;"></i>` +
              `${allResults.length} results for <strong>${data.query_gene}</strong> ` +
              `in <strong>${col}</strong> ` +
              `(confidence ${lastSearch.minConf} – ${lastSearch.maxConf})` +
              (data.cached ? ' <span style="color:var(--dark-gray);"><i class="fas fa-database"></i> cached</span>' : '');
    } else {
        const n = lastSearch.gene_pairs ? lastSearch.gene_pairs.length : 1;
        txt = `<i class="fas fa-info-circle" style="margin-right:8px;"></i>` +
              `${allResults.length} result${allResults.length !== 1 ? 's' : ''} for ${n} gene pair${n !== 1 ? 's' : ''}` +
              (data.cached ? ' <span style="color:var(--dark-gray);"><i class="fas fa-database"></i> cached</span>' : '');
    }
    document.getElementById('status').innerHTML = txt;
    document.getElementById('statusSearchTab').innerHTML = txt;
}

function showError(error) {
    document.getElementById('results').innerHTML =
        `<div class="no-results"><i class="fas fa-exclamation-triangle"></i> ${error.message || 'Unknown error'}</div>`;
}

// ── Download ──────────────────────────────────────────────────────────────────
function showDownloadOptions() { document.getElementById('downloadModal').style.display = 'block'; }
function closeModal()          { document.getElementById('downloadModal').style.display = 'none'; }

function downloadCSV(scope) {
    closeModal();
    const data = scope === 'current'
        ? allResults.slice((currentPage - 1) * resultsPerPage, currentPage * resultsPerPage)
        : allResults;
    if (!data.length) return;

    let csv;
    if (searchMode === 'single') {
        csv  = 'Gene 1,Gene 2,Confidence Score,Cell Line / Model\n';
        csv += data.map(r => `"${r.gene1}","${r.gene2}",${r.confidence_score},"${r.source}"`).join('\n');
    } else {
        const header = ['Gene 1', 'Gene 2', ...CELL_LINES, 'General'].join(',');
        csv = header + '\n';
        csv += data.map(r => {
            const scores = ALL_COLS.map(c => r[c] !== null && r[c] !== undefined ? r[c] : '');
            return `"${r.gene1}","${r.gene2}",${scores.join(',')}`;
        }).join('\n');
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href  = url;
    link.download = searchMode === 'single'
        ? `SLiGO_${lastSearch.gene}_${lastSearch.column}_${scope}.csv`
        : `SLiGO_pairs_${scope}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ── Cache ─────────────────────────────────────────────────────────────────────
function clearCache() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('loadingSearchTab').style.display = 'block';
    const msg = '<i class="fas fa-sync-alt fa-spin" style="margin-right:8px;"></i> Clearing cache...';
    document.getElementById('status').innerHTML = msg;
    document.getElementById('statusSearchTab').innerHTML = msg;

    fetch('/clear_cache')
        .then(r => r.json())
        .then(d => {
            const ok = d.status === 'success';
            const out = ok
                ? '<i class="fas fa-check-circle" style="color:var(--success-color);margin-right:8px;"></i> Cache cleared'
                : `<i class="fas fa-exclamation-circle" style="color:var(--error-color);margin-right:8px;"></i> ${d.message}`;
            document.getElementById('status').innerHTML = out;
            document.getElementById('statusSearchTab').innerHTML = out;
            if (ok && (lastSearch.gene || lastSearch.gene_pairs)) setTimeout(searchSLPartners, 800);
        })
        .catch(() => {
            const err = '<i class="fas fa-exclamation-circle" style="color:var(--error-color);margin-right:8px;"></i> Error clearing cache';
            document.getElementById('status').innerHTML = err;
            document.getElementById('statusSearchTab').innerHTML = err;
        })
        .finally(() => {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('loadingSearchTab').style.display = 'none';
        });
}
