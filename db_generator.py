import duckdb
import logging
from pathlib import Path
import time

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

# ----------------------------------------------------------------
# CONFIG
# ----------------------------------------------------------------
COMBINED_CSV    = "/home/user-kp/Documents/GitHub/SL_project/Directional_pipeline/final_combined_cellline_CV1.csv"           
# gene1, gene2, HEK293, HeLa, A-375, A-549, JURKAT, K-562
GENERAL_CSV     = "/home/user-kp/Documents/GitHub/SL_project/Directional_pipeline/final_combined_general_predictions_CV1.csv"
# gene1, gene2, Confidence_Score

CELL_LINE_DB    = "sl_cell_lines.duckdb"
GENERAL_DB      = "sl_general.duckdb"

CELL_LINES      = ["HEK293", "A-375", "A-549", "HeLa", "JURKAT", "K-562"]

# Safety check
for f in [COMBINED_CSV, GENERAL_CSV]:
    if not Path(f).exists():
        raise FileNotFoundError(f"{f} not found — aborting")


# ----------------------------------------------------------------
# Helper: shared DuckDB connection settings
# ----------------------------------------------------------------
def make_con(path):
    con = duckdb.connect(path)
    con.execute("PRAGMA threads=8")
    con.execute("PRAGMA memory_limit='16GB'")
    con.execute("PRAGMA temp_directory='/tmp'")
    return con


# ----------------------------------------------------------------
# Helper: verify a built table
# ----------------------------------------------------------------
def verify_table(con, table, columns):
    count = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    print(f"\n  Total rows : {count:,}")
    print(f"  NaN counts per column:")
    any_nulls = False
    for col in columns:
        nulls = con.execute(f'SELECT COUNT(*) FROM {table} WHERE "{col}" IS NULL').fetchone()[0]
        status = "✓" if nulls == 0 else "✗ NOT GOOD"
        if nulls > 0:
            any_nulls = True
        print(f"    {status}  {col}: {nulls:,} nulls")
    print(f"\n  First 3 rows:")
    print(con.execute(f"SELECT * FROM {table} LIMIT 3").fetchdf().to_string(index=False))
    return count, any_nulls


# ================================================================
# 1.  CELL LINE DATABASE
# ================================================================
print(f"\n{'═'*60}")
print(f"  BUILDING CELL LINE DB  →  {CELL_LINE_DB}")
print(f"{'═'*60}")

CL_BUILDING = CELL_LINE_DB + ".building"
Path(CL_BUILDING).unlink(missing_ok=True)
start = time.time()

try:
    con = make_con(CL_BUILDING)

    con.execute(f"""
        CREATE TABLE sl_pairs (
            gene_A  TEXT,
            gene_B  TEXT,
            {', '.join([f'"{cl}" FLOAT' for cl in CELL_LINES])}
        )
    """)

    logger.info("Inserting cell line data...")
    con.execute(f"""
        INSERT INTO sl_pairs
        SELECT
            LEAST(gene1, gene2)    AS gene_A,
            GREATEST(gene1, gene2) AS gene_B,
            {', '.join([f'"{cl}"' for cl in CELL_LINES])}
        FROM read_csv_auto('{COMBINED_CSV}')
        QUALIFY ROW_NUMBER() OVER (PARTITION BY LEAST(gene1, gene2), GREATEST(gene1, gene2)) = 1
    """)
    logger.info("Insert complete — building indexes...")

    con.execute("CREATE INDEX idx_geneA ON sl_pairs(gene_A)")
    con.execute("CREATE INDEX idx_geneB ON sl_pairs(gene_B)")
    for cl in CELL_LINES:
        con.execute(f'CREATE INDEX idx_{cl.replace("-","_")} ON sl_pairs("{cl}")')
    logger.info("Indexes built.")

    count, any_nulls = verify_table(con, "sl_pairs", ["gene_A", "gene_B"] + CELL_LINES)
    con.close()

    if Path(CELL_LINE_DB).exists():
        Path(CELL_LINE_DB).rename(CELL_LINE_DB + ".bak")
    Path(CL_BUILDING).rename(CELL_LINE_DB)

    elapsed = time.time() - start
    print(f"\n  ✓  Cell line DB built — {count:,} rows in {elapsed/60:.2f} min")
    if any_nulls:
        print(f"  ⚠  NULLs present — inspect before using in production")
    print(f"{'═'*60}\n")

except Exception as e:
    logger.error(f"Cell line DB build failed: {e}")
    try: con.close()
    except: pass
    Path(CL_BUILDING).unlink(missing_ok=True)
    raise


# ================================================================
# 2.  GENERAL DATABASE
# ================================================================
print(f"\n{'═'*60}")
print(f"  BUILDING GENERAL DB  →  {GENERAL_DB}")
print(f"{'═'*60}")

GEN_BUILDING = GENERAL_DB + ".building"
Path(GEN_BUILDING).unlink(missing_ok=True)
start = time.time()

try:
    con = make_con(GEN_BUILDING)

    con.execute("""
        CREATE TABLE sl_pairs (
            gene_A  TEXT,
            gene_B  TEXT,
            general FLOAT
        )
    """)

    logger.info("Inserting general data...")
    con.execute(f"""
        INSERT INTO sl_pairs
        SELECT
            LEAST(gene1, gene2)      AS gene_A,
            GREATEST(gene1, gene2)   AS gene_B,
            "Confidence_Score"       AS general
        FROM read_csv_auto('{GENERAL_CSV}')
        QUALIFY ROW_NUMBER() OVER (PARTITION BY LEAST(gene1, gene2), GREATEST(gene1, gene2)) = 1
    """)
    logger.info("Insert complete — building indexes...")

    con.execute("CREATE INDEX idx_geneA   ON sl_pairs(gene_A)")
    con.execute("CREATE INDEX idx_geneB   ON sl_pairs(gene_B)")
    con.execute("CREATE INDEX idx_general ON sl_pairs(general)")
    logger.info("Indexes built.")

    count, any_nulls = verify_table(con, "sl_pairs", ["gene_A", "gene_B", "general"])
    con.close()

    if Path(GENERAL_DB).exists():
        Path(GENERAL_DB).rename(GENERAL_DB + ".bak")
    Path(GEN_BUILDING).rename(GENERAL_DB)

    elapsed = time.time() - start
    print(f"\n  ✓  General DB built — {count:,} rows in {elapsed/60:.2f} min")
    if any_nulls:
        print(f"  ⚠  NULLs present — inspect before using in production")
    print(f"{'═'*60}\n")

except Exception as e:
    logger.error(f"General DB build failed: {e}")
    try: con.close()
    except: pass
    Path(GEN_BUILDING).unlink(missing_ok=True)
    raise
