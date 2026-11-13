"""Smoke tests: python -m pytest -q   (uses a tiny generated CSV + the sample handbook)."""
import os, tempfile, pathlib, importlib

def test_end_to_end(tmp_path, monkeypatch):
    monkeypatch.setenv("SHRAG_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("SHRAG_USE_EMBEDDINGS", "off")
    import app.config, app.store
    importlib.reload(app.config); importlib.reload(app.store)
    from app import ingest, healer, textrag
    importlib.reload(textrag); importlib.reload(ingest); importlib.reload(healer)
    csv = tmp_path / "orders.csv"
    rows = ["order_id,city,category,amount,order_date"]
    for i in range(300):
        city = ["Mysuru", "Bengaluru", "Chennai"][i % 3 if i % 5 else 1]
        rows.append(f"{i},{city},{['Books','Toys'][i % 2]},{10 + i % 7},2024-0{1 + i % 9}-1{i % 9}")
    csv.write_text("\n".join(rows))
    ingest.ingest_file(csv, csv.name)
    ingest.ingest_file(pathlib.Path(__file__).parent.parent / "app" / "sample_data" / "security_handbook.md", "security_handbook.md")

    r = healer.answer("Which city had the most orders?")
    assert r["status"] == "verified" and "Bengaluru" in r["answer"]
    r = healer.answer("How many orders were there in 2031?")
    assert r["status"] == "withheld"
    r = healer.answer("How must passwords be stored?")
    assert r["status"] == "verified" and "Argon2id" in r["answer"]
    r = healer.answer("Which city had the most orders?", inject_false_claim=True)
    assert r["status"] == "corrected" and r["healed"]
