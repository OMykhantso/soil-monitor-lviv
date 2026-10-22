from fastapi.testclient import TestClient
from api import app

client=TestClient(app)

def test_health():
    r=client.get('/health'); assert r.status_code==200 and r.json()['rule_count']==243

def test_assess_and_validation():
    sample={'pb':6,'cd':.7,'zn':23,'ph':6.8,'ap':1}
    r=client.post('/assess',json=sample)
    assert r.status_code==200 and r.json()['category']=='помірний'
    assert len(r.json()['top_rules'])>=1
    assert client.post('/assess',json={**sample,'pb':31}).status_code==422
    assert client.post('/assess',json={**sample,'ap':3.5}).status_code==422
