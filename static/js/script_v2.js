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

    // Enter key support
    const enterIds = [
        'geneInputSearchTab',
        'minConfidenceInputSearchTab',
        'maxConfidenceInputSearchTab'
    ];

    enterIds.forEach(id => {

        const element =
            document.getElementById(id);

        if (element) {

            element.addEventListener(
                'keypress',
                e => {

                    if (e.key === 'Enter') {
                        searchSLPartners();
                    }

                }
            );

        }

    });


    // Search mode toggle
    const toggleButton =
        document.getElementById(
            'toggleSearchModeSearchTab'
        );

    if (toggleButton) {

        toggleButton.addEventListener(
            'click',
            toggleSearchMode
        );

    }


    // Gene autocomplete
    setupAutocomplete(
        'geneInputSearchTab'
    );


    // Close modal
    window.addEventListener('click', e => {

        const modal =
            document.getElementById(
                'downloadModal'
            );

        if (
            modal &&
            e.target === modal
        ) {

            closeModal();

        }

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

    if (!input) {
        console.warn(`Autocomplete input not found: ${inputId}`);
        return;
    }

    input.addEventListener('input', function () {

        const val = this.value;

        if (val.length < 2) {
            closeAllLists();
            return;
        }

        fetch(`${endpoint}?q=${encodeURIComponent(val)}`)
            .then(r => r.json())
            .then(suggestions => {

                closeAllLists();

                if (!suggestions.length) {
                    return;
                }

                const list = document.createElement('DIV');

                list.className = 'autocomplete-items';

                this.parentNode.appendChild(list);

                suggestions.forEach(item => {

                    const div = document.createElement('DIV');

                    div.innerHTML =
                        `<strong>${item.substring(0, val.length)}</strong>` +
                        `${item.substring(val.length)}`;

                    div.innerHTML +=
                        `<input type="hidden" value="${item}">`;

                    div.addEventListener('click', () => {

                        input.value = item;

                        closeAllLists();

                    });

                    list.appendChild(div);

                });

            })
            .catch(error => {
                console.error('Autocomplete error:', error);
            });

    });


    input.addEventListener('keydown', function (e) {

        const items =
            document.getElementsByClassName('autocomplete-items')[0];

        if (!items) {
            return;
        }

        let active =
            items.getElementsByClassName('autocomplete-active')[0];


        if (e.keyCode === 40) {

            // ↓

            e.preventDefault();

            if (!active) {

                items.firstElementChild
                    ?.classList.add('autocomplete-active');

            } else if (active.nextElementSibling) {

                active.classList.remove('autocomplete-active');

                active.nextElementSibling
                    .classList.add('autocomplete-active');

            }

        }


        else if (e.keyCode === 38) {

            // ↑

            e.preventDefault();

            if (active?.previousElementSibling) {

                active.classList.remove('autocomplete-active');

                active.previousElementSibling
                    .classList.add('autocomplete-active');

            }

        }


        else if (e.keyCode === 13 && active) {

            e.preventDefault();

            active.click();

        }

    });

}

function closeAllLists() {
    document.querySelectorAll('.autocomplete-items').forEach(el => el.remove());
}

// ── Search mode toggle ────────────────────────────────────────────────────────
// ── Search mode toggle ────────────────────────────────────────────────────────
function toggleSearchMode() {

    // Clear previous results
    document.getElementById('results').innerHTML = '';
    //document.getElementById('pagination').style.display = 'none';

    const status = document.getElementById('statusSearchTab');
    if (status) {
        status.textContent = '';
    }

    const downloadBtn =
        document.getElementById('downloadBtnSearchTab');

    if (downloadBtn) {
        downloadBtn.disabled = true;
    }

    allResults = [];
    lastSearch = {};


    // ============================================================
    // SINGLE GENE → GENE PAIR
    // ============================================================

    if (searchMode === 'single') {

        searchMode = 'pair';

        document.getElementById(
            'singleGeneFormSearchTab'
        ).style.display = 'none';

        document.getElementById(
            'genePairFormSearchTab'
        ).style.display = 'block';

        document.getElementById(
            'searchTitleSearchTab'
        ).innerHTML =
            '<i class="fas fa-search" style="margin-right: 10px;"></i>' +
            'Search by Gene Pair';

        document.getElementById(
            'toggleSearchModeSearchTab'
        ).innerHTML =
            '<i class="fas fa-exchange-alt"></i> Search Single Gene';

        // Clear single gene input
        document.getElementById(
            'geneInputSearchTab'
        ).value = '';

    }


    // ============================================================
    // GENE PAIR → SINGLE GENE
    // ============================================================

    else {

        searchMode = 'single';

        document.getElementById(
            'singleGeneFormSearchTab'
        ).style.display = 'block';

        document.getElementById(
            'genePairFormSearchTab'
        ).style.display = 'none';

        document.getElementById(
            'searchTitleSearchTab'
        ).innerHTML =
            '<i class="fas fa-search" style="margin-right: 10px;"></i>' +
            'Search SL Partners';

        document.getElementById(
            'toggleSearchModeSearchTab'
        ).innerHTML =
            '<i class="fas fa-exchange-alt"></i> Search by Gene Pair';

        // Clear pair input
        document.getElementById(
            'genePairsInputSearchTab'
        ).value = '';
    }
}

// ── Main search ───────────────────────────────────────────────────────────────
// ── Main search ───────────────────────────────────────────────────────────────
async function searchSLPartners() {

    // ============================================================
    // CLEAR PREVIOUS RESULTS
    // ============================================================

    document.getElementById('results').innerHTML = '';

    //document.getElementById('pagination').style.display = 'none';

    document.getElementById(
        'statusSearchTab'
    ).textContent = '';

    document.getElementById(
        'downloadBtnSearchTab'
    ).disabled = true;

    allResults = [];


    try {

        // ========================================================
        // SHOW LOADING
        // ========================================================

        document.getElementById(
            'loadingSearchTab'
        ).style.display = 'block';


        // ========================================================
        // SINGLE GENE SEARCH
        // ========================================================

        if (searchMode === 'single') {

            const gene =
                document.getElementById(
                    'geneInputSearchTab'
                ).value.trim();


            const column =
                document.getElementById(
                    'cellLineSelectSearchTab'
                ).value;


            const minConf =
                parseFloat(
                    document.getElementById(
                        'minConfidenceInputSearchTab'
                    ).value
                );


            const maxConf =
                parseFloat(
                    document.getElementById(
                        'maxConfidenceInputSearchTab'
                    ).value
                );


            // ----------------------------------------------------
            // Validation
            // ----------------------------------------------------

            if (!gene) {
                throw new Error(
                    'Please enter a gene name'
                );
            }


            if (minConf > maxConf) {
                throw new Error(
                    'Minimum confidence cannot exceed maximum'
                );
            }


            // ----------------------------------------------------
            // Save search
            // ----------------------------------------------------

            lastSearch = {
                gene,
                column,
                minConf,
                maxConf
            };


            // ----------------------------------------------------
            // Build API request
            // ----------------------------------------------------
            
            const geneFilter = document.querySelector(
                'input[name="geneFilterSearchTab"]:checked'
                ).value;

            const params = new URLSearchParams({

                gene: gene,

                column: column,

                min_confidence: minConf,

                max_confidence: maxConf,

                gene_filter: geneFilter

                //order: order

            });


            // ----------------------------------------------------
            // Call Flask API
            // ----------------------------------------------------

            const response =
                await fetch(`/search?${params}`);


            const data =
                await response.json();


            if (data.error) {
                throw new Error(data.error);
            }


            // ----------------------------------------------------
            // Store results
            // ----------------------------------------------------

            allResults = data.results;

            updateStatus(data);

        }


        // ========================================================
        // GENE PAIR SEARCH
        // ========================================================

        else {

            const rawText =
                document.getElementById(
                    'genePairsInputSearchTab'
                ).value.trim();


            // ----------------------------------------------------
            // Validation
            // ----------------------------------------------------

            if (!rawText) {

                throw new Error(
                    'Please enter gene pairs to search for'
                );

            }


            // ----------------------------------------------------
            // Parse gene pairs
            // ----------------------------------------------------

            const genePairs = [];


            rawText
                .split('\n')
                .forEach(line => {

                    const parts =
                        line
                            .split(',')
                            .map(g => g.trim());


                    if (
                        parts.length === 2 &&
                        parts[0] &&
                        parts[1]
                    ) {

                        genePairs.push({

                            gene1:
                                parts[0].toUpperCase(),

                            gene2:
                                parts[1].toUpperCase()

                        });

                    }

                });


            if (!genePairs.length) {

                throw new Error(
                    'No valid gene pairs found. Use format: Gene1,Gene2'
                );

            }


            // ----------------------------------------------------
            // Save search
            // ----------------------------------------------------

            lastSearch = {
                gene_pairs: genePairs
            };


            // ----------------------------------------------------
            // Build API request
            // ----------------------------------------------------

            const params =
                new URLSearchParams();


            genePairs.forEach(pair => {

                params.append(
                    'pairs',
                    `${pair.gene1},${pair.gene2}`
                );

            });


            // ----------------------------------------------------
            // Call Flask API
            // ----------------------------------------------------

            const response =
                await fetch(
                    `/search_pairs?${params}`
                );


            const data =
                await response.json();


            if (data.error) {
                throw new Error(data.error);
            }


            // ----------------------------------------------------
            // Store results
            // ----------------------------------------------------

            allResults = data.results;

            updateStatus(data);

        }


        // ========================================================
        // NETWORK DATA
        // ========================================================

        if (activeTab === 'search') {

            getNetworkData();

        }


        // ========================================================
        // DISPLAY RESULTS
        // ========================================================

        if (allResults.length > 0) {

            currentPage = 1;


            if (searchMode === 'single') {
                sortResults();
            }


            displayResultsPage();


            document.getElementById(
                'downloadBtnSearchTab'
            ).disabled = false;


        } else {

            document.getElementById(
                'results'
            ).innerHTML =
                `<div class="no-results">
                    No results found matching your criteria
                </div>`;

        }


    } catch (error) {

        console.error(
            'Search error:',
            error
        );

        showError(error);

    }


    finally {

        // ========================================================
        // HIDE LOADING
        // ========================================================

        document.getElementById(
            'loadingSearchTab'
        ).style.display = 'none';

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
    //const start       = (currentPage - 1) * resultsPerPage;
    //const pageResults = allResults.slice(start, start + resultsPerPage);

    //const ind = f => f === currentSort.field ? (currentSort.order === 'desc' ? ' ▼' : ' ▲') : '';
    const pageResults = allResults;

    const ind = f => f === currentSort.field
        ? (currentSort.order === 'desc' ? ' ▼' : ' ▲')
        : '';
        
    let html = `<h3><i class="fas fa-list" style="color: var(--accent-color); margin-right: 10px;"></i>${allResults.length} Result${allResults.length !== 1 ? 's' : ''} Found</h3>`;
      
    if (searchMode === 'single') {
        // ── Single-gene table: Gene1 | Gene2 | Confidence | Source ──
        html += `
        <table id="sl-results-table" class="results-table">
            <thead><tr>
                <th class="sortable" onclick="changeSort('gene1')">Gene 1${ind('gene1')}</th>
                <th class="sortable" onclick="changeSort('gene2')">Gene 2${ind('gene2')}</th>
                <th class="sortable" onclick="changeSort('confidence_score')">Confidence Score${ind('confidence_score')}</th>
                <th>Source</th>
            </tr></thead>
            <tbody>`;

        pageResults.forEach(r => {
            const gene1Url = `https://genecards.org/card/${r.gene1}`;
            const gene2Url = `https://genecards.org/card/${r.gene2}`;

            html += `<tr>
                <td><a href="${gene1Url}" target="_blank" rel="noopener noreferrer">${r.gene1}</a></td>
                <td><a href="${gene2Url}" target="_blank" rel="noopener noreferrer">${r.gene2}</a></td>
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
        <table id="sl-results-table" class="results-table pair-table">
            <thead><tr>
                <th>Gene 1</th>
                <th>Gene 2</th>
                ${CELL_LINES.map(cl => `<th>${cl}</th>`).join('')}
                <th>General</th>
            </tr></thead>
            <tbody>`;

        pageResults.forEach(r => {
            
            
            const gene1Url = `https://genecards.org/card/${r.gene1}`;
            const gene2Url = `https://genecards.org/card/${r.gene2}`;

            html += `<tr>
                <td><a href="${gene1Url}" target="_blank" rel="noopener noreferrer">${r.gene1}</a></td>
                <td><a href="${gene2Url}" target="_blank" rel="noopener noreferrer">${r.gene2}</a></td>
                ${CELL_LINES.map(cl => `<td>${fmtPair(r[cl])}</td>`).join('')}
                <td>${fmtPair(r['general'])}</td>
            </tr>`;
        });

        html += `</tbody></table></div>`;
    }

    if (searchMode === 'single') html += `</tbody></table>`;

    document.getElementById('results').innerHTML = html;
    updatePagination();

    if (typeof $ !== 'undefined' && $.fn.DataTable) {
    $('#sl-results-table').DataTable({
        // paging: false,
        ordering: false,
        info: false,
        searching: true,
    
     language: {
            search: "Filter results:"
        }
    });
} else {
    console.error('jQuery or DataTables is not loaded');
}

}

// ── Pagination ────────────────────────────────────────────────────────────────
function changePageSize() {
    resultsPerPage = parseInt(document.getElementById('resultsPerPage').value);
    currentPage = 1;
    displayResultsPage();
}

function updatePagination() {
    const totalPages = Math.ceil(allResults.length / resultsPerPage);
    //document.getElementById('pagination').style.display = totalPages > 1 ? 'flex' : 'none';

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

        const col =
            lastSearch.column === 'general'
                ? 'General model'
                : lastSearch.column;

        txt =
            `<i class="fas fa-info-circle" style="margin-right:8px;"></i>` +
            `${allResults.length} results for <strong>${data.query_gene}</strong> ` +
            `in <strong>${col}</strong> ` +
            `(confidence ${lastSearch.minConf} – ${lastSearch.maxConf})` +
            (
                data.cached
                    ? ' <span style="color:var(--dark-gray);"><i class="fas fa-database"></i> cached</span>'
                    : ''
            );

    } else {

        const n =
            lastSearch.gene_pairs
                ? lastSearch.gene_pairs.length
                : 1;

        txt =
            `<i class="fas fa-info-circle" style="margin-right:8px;"></i>` +
            `${allResults.length} result${allResults.length !== 1 ? 's' : ''} ` +
            `for ${n} gene pair${n !== 1 ? 's' : ''}` +
            (
                data.cached
                    ? ' <span style="color:var(--dark-gray);"><i class="fas fa-database"></i> cached</span>'
                    : ''
            );
    }

    // Search Tab status only
    const statusSearchTab =
        document.getElementById('statusSearchTab');

    if (statusSearchTab) {
        statusSearchTab.innerHTML = txt;
    }
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


/*****************************KLR ******************************/
/*GENE NETWORK*/
/*generating nodes and links from the json */
async function getNetworkData() {

    const gene = document
        .getElementById('geneInputSearchTab')
        .value
        .trim()
        .toUpperCase();

    const column = document
        .getElementById('cellLineSelectSearchTab')
        .value;

    const minConfidence = document
        .getElementById('minConfidenceInputSearchTab')
        .value;

    const maxConfidence = document
        .getElementById('maxConfidenceInputSearchTab')
        .value;

    if (!gene) {
        console.log("No gene entered");
        return;
    }

    const url =
        `/search?gene=${encodeURIComponent(gene)}` +
        `&min_confidence=${minConfidence}` +
        `&max_confidence=${maxConfidence}` +
        `&column=${encodeURIComponent(column)}`;

    const response = await fetch(url);

    const data = await response.json();

    console.log("JSON received from Flask:");
    console.log(data);


    // CREATE NODES

    const nodes = [
        {
            id: data.query_gene,
            type: "query"
        }
    ];

    
    data.results.forEach(result => {

        nodes.push({
            id: result.gene2,
            type: "partner"
        });

    });

    console.log("NODES:");
    console.log(nodes);

    const links = [];

data.results.forEach(result => {

    links.push({
        source: result.gene1,
        target: result.gene2,
        score: result.confidence_score,
        source_db: result.source
    });

});

console.log("NUMBER OF LINKS:", links.length);
console.log("FIRST LINK:", links[0]);
console.log("SECOND LINK:", links[1]);
console.log("THIRD LINK:", links[2]);

drawSimpleNetwork(nodes, links);
}
function drawSimpleNetwork(nodes, links) {
    //removes previous network
    d3.select("#network").selectAll("*").remove();

    const container = document.getElementById("network");

    const width = container.clientWidth;
    const height = 600;

    const svg = d3.select("#network")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const tooltip = d3.select("body")
        .append("div")
        .attr("class", "gene-tooltip")
        .style("display", "none");

    // Draw links
    const link = svg
    .append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.5)
    .attr("stroke-width", d => 1 + d.score * 4)

    .on("mouseover", function(event, d) {

        d3.select(this)
            .attr("stroke-width", 6);

        tooltip
            .style("display", "block")
            .html(`
                <strong>${d.source.id || d.source}</strong>
                → 
                <strong>${d.target.id || d.target}</strong>
                <br>
                Confidence: ${d.score.toFixed(3)}
                <br>
                Source: ${d.source_db}
            `);
    })

    .on("mousemove", function(event) {

        tooltip
            .style("left", `${event.pageX + 12}px`)
            .style("top", `${event.pageY + 12}px`);
    })

    .on("mouseout", function(event, d) {

        d3.select(this)
            .attr("stroke-width", 1 + d.score * 4);

        tooltip
            .style("display", "none");
    });

    // Draw nodes
    const node = svg
    .append("g")
    .attr("class", "nodes")
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("r", d => d.type === "query" ? 18 : 6)
    .attr("fill", d => d.type === "query" ? "red" : "steelblue")
    .attr("stroke", "#333")
    .attr("stroke-width", d => d.type === "query" ? 3 : 1)

    // ── Mouse enters node ──
    .on("mouseover", function(event, d) {

        d3.select(this)
            .attr("r", d.type === "query" ? 22 : 10);

        tooltip
            .style("display", "block")
            .html(`<strong>${d.id}</strong>`);
    })

    // ── Mouse moves ──
    .on("mousemove", function(event) {

        tooltip
            .style("left", `${event.pageX + 12}px`)
            .style("top", `${event.pageY + 12}px`);
    })

    // ── Mouse leaves node ──
    .on("mouseout", function(event, d) {

        d3.select(this)
            .attr("r", d.type === "query" ? 18 : 6);

        tooltip
            .style("display", "none");
    });

    // Force simulation
    const simulation = d3.forceSimulation(nodes)

    .force(
        "link",
        d3.forceLink(links)
            .id(d => d.id)
            //.distance(d => 100 + (1 - d.score) * 250)
            .distance(d => {
            return 200 - (d.score * 120);})
            .strength(0.8)
    )

    .force(
        "charge",
        d3.forceManyBody()
            .strength(-20)
    )

    .force(
        "center",
        d3.forceCenter(width / 2, height / 2)
    )

    .force(
        "collision",
        d3.forceCollide()
            .radius(d => d.type === "query" ? 22 : 10)
    );
    
    const queryNode = nodes.find(d => d.type === "query");

        if (queryNode) {
        queryNode.fx = width / 2;
        queryNode.fy = height / 2;
        }

    // Update positions
    simulation.on("tick", () => {

        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);

    });
}


/*****************SLIDER AT SEARCH*************************************/
document.addEventListener('DOMContentLoaded', function () {

    const slider = document.getElementById(
        'confidenceRangeSearchTab'
    );

    const output = document.getElementById(
        'demoSearchTab'
    );

    if (!slider || !output) {
        console.error(
            'Search slider elements not found'
        );
        return;
    }

    function updateSlider() {

        output.textContent = slider.value;

        const percentage =
            ((slider.value - slider.min) /
            (slider.max - slider.min)) * 100;

        slider.style.background =
            "linear-gradient(to right, #04AA6D " +
            percentage +
            "%, #d3d3d3 " +
            percentage +
            "%)";
    }

    // Set initial value
    updateSlider();

    // Update when slider moves
    slider.addEventListener(
        'input',
        updateSlider
    );

});