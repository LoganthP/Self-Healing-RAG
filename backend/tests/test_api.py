"""python -m pytest -q   (from the backend folder)"""
import importlib
import time


def test_end_to_end(tmp_path, monkeypatch):
    monkeypatch.setenv("SHRAG_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("SHRAG_USE_EMBEDDINGS", "off")
    import app.config
    importlib.reload(app.config)
    import app.store, app.meta, app.textrag, app.ingest, app.jobs, app.settings_store, app.healer, app.main
    for m in (app.store, app.meta, app.textrag, app.ingest, app.jobs, app.settings_store, app.healer, app.main):
        importlib.reload(m)
    from fastapi.testclient import TestClient
    rows = ["order_id,city,category,amount,order_date"]
    for i in range(300):
        city = ["Mysuru", "Bengaluru", "Chennai"][i % 3 if i % 5 else 1]
        rows.append(f"{i},{city},{['Books', 'Toys'][i % 2]},{10 + i % 7},2024-0{1 + i % 9}-1{i % 9}")
    with TestClient(app.main.app) as c:
        r = c.post("/api/v1/documents/stream?filename=orders.csv", content="\n".join(rows).encode())
        assert r.status_code == 200 and not r.json()["duplicate"]
        assert c.post("/api/v1/documents/sample").status_code == 200
        for _ in range(100):
            docs = c.get("/api/v1/documents").json()
            if all(d["status"] == "ready" for d in docs):
                break
            time.sleep(0.2)
        assert all(d["status"] == "ready" for d in docs), docs

        ex = c.post("/api/v1/chat/query", json=dict(question="Which city had the most orders?")).json()
        assert ex["status"] == "accepted" and "Bengaluru" in ex["answer"]
        ex = c.post("/api/v1/chat/query", json=dict(question="How many orders were there in 2031?")).json()
        assert ex["status"] == "abstained"
        ex = c.post("/api/v1/chat/query", json=dict(question="How must passwords be stored?", fault_injection=True)).json()
        assert ex["status"] == "accepted" and ex["healing"]["triggered"] and "Argon2id" in ex["answer"]
        assert c.get("/api/v1/suggestions").json()
        run = c.post("/api/v1/evaluations/run", json=dict(document_ids=[])).json()
        for _ in range(200):
            run = c.get(f"/api/v1/evaluations/{run['id']}").json()
            if run["status"] == "completed":
                break
            time.sleep(0.2)
        assert run["status"] == "completed"
        assert run["summary"]["self_healing"]["keyword_recall"] >= run["summary"]["baseline"]["keyword_recall"]
