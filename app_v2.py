from flask import Flask, request, jsonify, render_template, make_response
from flask_caching import Cache
import duckdb
from pathlib import Path
import time
import hashlib

app = Flask(__name__)

# ── Databases ─────────────────────────────────────────────────────────────────
CELL_LINE_DB = 'sl_cell_lines.duckdb'
GENERAL_DB   = 'sl_general.duckdb'
CELL_LINES   = ["HEK293", "A-375", "A-549", "HeLa", "JURKAT", "K-562"]
ALL_COLS     = CELL_LINES + ["general"]

for db in [CELL_LINE_DB, GENERAL_DB]:
    if not Path(db).exists():
        raise FileNotFoundError(f"{db} not found. Run db_generator.py first.")

# ── Druggable genes ───────────────────────────────────────────────────────────
DRUGGABLE_GENES_FILE = (
    Path(__file__).parent / "data" / "druggable_genes.txt"
)

if not DRUGGABLE_GENES_FILE.exists():
    raise FileNotFoundError(
        f"{DRUGGABLE_GENES_FILE} not found."
    )

with open(DRUGGABLE_GENES_FILE, "r") as f:
    DRUGGABLE_GENES = {
        line.strip().upper()
        for line in f
        if line.strip()
    }

print("Number of druggable genes:", len(DRUGGABLE_GENES))

# ── Cache ─────────────────────────────────────────────────────────────────────
def _db_version() -> str:
    mt1 = int(Path(CELL_LINE_DB).stat().st_mtime)
    mt2 = int(Path(GENERAL_DB).stat().st_mtime)
    return f"{mt1}-{mt2}"

cache = Cache(app, config={
    'CACHE_TYPE': 'SimpleCache',
    'CACHE_DEFAULT_TIMEOUT': 3600,
})

def _cache_key(*parts) -> str:
    raw = "|".join(str(p) for p in parts) + "|v=" + _db_version()
    return hashlib.md5(raw.encode()).hexdigest()

# ── DuckDB helpers ────────────────────────────────────────────────────────────
def get_cl_con():
    return duckdb.connect(CELL_LINE_DB, read_only=True)

def get_gen_con():
    return duckdb.connect(GENERAL_DB, read_only=True)

# ── Routes ────────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index_v2.html')

@app.route('/clear_cache')
def clear_cache():
    try:
        cache.clear()
        return jsonify({'status': 'success', 'message': 'Cache cleared successfully'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 




# ── Gene search ───────────────────────────────────────────────────────────────
@app.route('/search', methods=['GET'])
def search():
    try:
        gene_name      = request.args.get('gene', '').upper().strip()
        min_confidence = float(request.args.get('min_confidence', 0.0))
        max_confidence = float(request.args.get('max_confidence', 1.0))
        column         = request.args.get('column', 'general').strip()
        sort_order     = request.args.get('order', 'desc').lower()
        gene_filter = request.args.get('gene_filter', 'all').lower()

        if column not in ALL_COLS:
            column = 'general'

        if not gene_name:
            return jsonify({'error': 'Please enter a gene name'}), 400

        # Route to the correct DB based on column
        is_general = (column == 'general')

        ck = _cache_key('search', gene_name, min_confidence, max_confidence, column, sort_order, gene_filter)
        cached = cache.get(ck)
        if cached:
            cached['cached'] = True
            return jsonify(cached)

        sort_dir   = 'DESC' if sort_order == 'desc' else 'ASC'
        col_quoted = f'"{column}"'
        con        = get_gen_con() if is_general else get_cl_con()

        exists = con.execute("""
            SELECT 1 FROM sl_pairs
            WHERE (gene_A = ? OR gene_B = ?) LIMIT 1
        """, [gene_name, gene_name]).fetchone()

        if not exists:
            con.close()
            return jsonify({
                'query_gene': gene_name,
                'message':    'Gene not found in database',
                'results':    [],
                'count':      0,
            })

        rows = con.execute(f"""
            SELECT
                CASE WHEN gene_A = ? THEN gene_A ELSE gene_B END AS query_gene,
                CASE WHEN gene_A = ? THEN gene_B ELSE gene_A END AS partner_gene,
                {col_quoted} AS confidence_score
            FROM sl_pairs
            WHERE (gene_A = ? OR gene_B = ?)
              AND {col_quoted} BETWEEN ? AND ?
            ORDER BY {col_quoted} {sort_dir}
        """, [gene_name, gene_name, gene_name, gene_name,
              min_confidence, max_confidence]).fetchall()

        con.close()

        def _source(score: float) -> str:
            if score == 0.0: return 'DepMap'
            if score == 1.0: return 'SynLethDB'
            return 'Predictions'

        results = [
            {
                'gene1':            r[0],
                'gene2':            r[1],
                'confidence_score': round(r[2], 5),
                'source':           _source(r[2]),
            }
            for r in rows
        ]

        # ── Druggable filter ─────────────────────────────────────────────────
        if gene_filter == 'druggable':
            results = [
                result for result in results
                if result['gene2'].upper() in DRUGGABLE_GENES
            ]

        payload = {
            'query_gene':     gene_name,
            'column':         column,
            'min_confidence': min_confidence,
            'max_confidence': max_confidence,
            'sort_order':     sort_order,
            'gene_filter':    gene_filter,
            'results':        results,
            'count':          len(results),
            'cached':         False,
        }
        cache.set(ck, payload)

        resp = make_response(jsonify(payload))
        resp.headers['Cache-Control'] = 'public, max-age=600'
        return resp

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Pair search ───────────────────────────────────────────────────────────────
@app.route('/search_pairs', methods=['GET'])
def search_pairs():
    try:
        raw_pairs  = request.args.getlist('pairs')
        gene_pairs = []
        for p in raw_pairs:
            parts = p.split(',')
            if len(parts) == 2:
                gene_pairs.append({'gene1': parts[0].strip(), 'gene2': parts[1].strip()})

        if not gene_pairs:
            return jsonify({'error': 'No valid gene pairs provided'}), 400

        norm_pairs = []
        for p in gene_pairs:
            g1 = p.get('gene1', '').upper().strip()
            g2 = p.get('gene2', '').upper().strip()
            if g1 and g2:
                norm_pairs.append(tuple(sorted([g1, g2])))
        norm_pairs = sorted(set(norm_pairs))

        if not norm_pairs:
            return jsonify({'error': 'No valid gene pairs found'}), 400

        ck = _cache_key('pairs', str(norm_pairs))
        cached = cache.get(ck)
        if cached:
            cached['cached'] = True
            return jsonify(cached)

        # Build shared WHERE clause
        conditions = [
            "((gene_A = ? AND gene_B = ?) OR (gene_A = ? AND gene_B = ?))"
            for _ in norm_pairs
        ]
        where = ' OR '.join(conditions)
        params = []
        for g1, g2 in norm_pairs:
            params.extend([g1, g2, g2, g1])

        # ── Query cell line DB ────────────────────────────────────────────────
        cl_con    = get_cl_con()
        cl_select = ', '.join(f'"{c}"' for c in CELL_LINES)
        cl_rows   = cl_con.execute(f"""
            SELECT gene_A, gene_B, {cl_select}
            FROM sl_pairs
            WHERE {where}
        """, params).fetchall()
        cl_con.close()

        # ── Query general DB ──────────────────────────────────────────────────
        gen_con  = get_gen_con()
        gen_rows = gen_con.execute(f"""
            SELECT gene_A, gene_B, "general"
            FROM sl_pairs
            WHERE {where}
        """, params).fetchall()
        gen_con.close()

        # ── Merge by (gene_A, gene_B) key ─────────────────────────────────────
        # Build lookup dicts keyed by normalised pair
        cl_lookup  = {(r[0], r[1]): r[2:] for r in cl_rows}
        gen_lookup = {(r[0], r[1]): r[2]  for r in gen_rows}

        all_keys = sorted(set(cl_lookup) | set(gen_lookup))

        results = []
        for key in all_keys:
            entry = {'gene1': key[0], 'gene2': key[1]}

            cl_vals = cl_lookup.get(key)
            for i, col in enumerate(CELL_LINES):
                entry[col] = round(cl_vals[i], 5) if cl_vals and cl_vals[i] is not None else None

            gen_val = gen_lookup.get(key)
            entry['general'] = round(gen_val, 5) if gen_val is not None else None

            results.append(entry)

        payload = {
            'gene_pairs': [{'gene1': g1, 'gene2': g2} for g1, g2 in norm_pairs],
            'results':    results,
            'count':      len(results),
            'gene_filter': gene_filter,
            'cached':     False,
        }
        cache.set(ck, payload)

        resp = make_response(jsonify(payload))
        resp.headers['Cache-Control'] = 'public, max-age=600'
        return resp

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Gene autocomplete ─────────────────────────────────────────────────────────
@app.route('/api/genes')
def get_gene_suggestions():
    try:
        gene_file = Path("/media/user/27df11fd-a3ba-47c1-879e-351db822813b/SLxGO_website/name_files/gene_names.txt")
        if not gene_file.exists():
            return jsonify([])

        file_mtime = gene_file.stat().st_mtime
        if not hasattr(app, 'gene_list_mtime') or file_mtime > app.gene_list_mtime:
            with open(gene_file) as f:
                app.gene_list = [line.strip() for line in f if line.strip()]
            app.gene_list_mtime = file_mtime

        query       = request.args.get('q', '').upper()
        suggestions = [g for g in app.gene_list if g.upper().startswith(query)][:10]

        resp = make_response(jsonify(suggestions))
        resp.headers['Cache-Control'] = 'public, max-age=86400'
        return resp

    except Exception as e:
        app.logger.error(f"Autocomplete error: {e}")
        return jsonify([])

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=7777, debug=True)
