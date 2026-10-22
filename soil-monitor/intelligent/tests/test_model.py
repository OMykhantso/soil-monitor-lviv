import itertools
import numpy as np
import pytest
from fuzzy_model import (SoilFuzzyModel, INPUT_MFS, INPUT_RANGES, OUTPUT_MFS,
                         generated_rules, load_rules, membership, rule_category)

@pytest.fixture(scope="module")
def model():
    return SoilFuzzyModel(sample_points=1001)

def test_rules_exhaustive_exact():
    rules = load_rules()
    assert rules == generated_rules()
    assert len(rules) == len({r.antecedent for r in rules}) == 243
    assert [sum(r.consequent == i for r in rules) for i in range(1,5)] == [9,43,68,123]
    for r in rules:
        assert r.consequent == rule_category(r.antecedent)[0]

def test_membership_partition_of_unity_all_inputs():
    for terms, (lo,hi) in zip(INPUT_MFS, INPUT_RANGES):
        xs=np.linspace(lo,hi,2001)
        ys=np.array([membership(xs, term) for term in terms])
        np.testing.assert_allclose(ys.sum(axis=0),np.ones(xs.shape),atol=1e-12)

def test_output_partition_of_unity():
    xs=np.linspace(0,10,2001)
    ys=np.array([membership(xs,p) for p in OUTPUT_MFS])
    np.testing.assert_allclose(ys.sum(axis=0),np.ones(xs.shape),atol=1e-12)

def test_scenarios(model):
    low=model.evaluate(pb=1,cd=.15,zn=1,ph=6.8,ap=1)
    low_high_ap=model.evaluate(pb=1,cd=.15,zn=1,ph=4.5,ap=9)
    at_gdk=model.evaluate(pb=6,cd=.7,zn=23,ph=6.8,ap=1)
    acid_at_gdk=model.evaluate(pb=6,cd=.7,zn=23,ph=4.5,ap=9)
    lead_high=model.evaluate(pb=18,cd=.14,zn=2,ph=6.8,ap=1)
    lead_high_acid=model.evaluate(pb=18,cd=.14,zn=2,ph=4.5,ap=9)
    two_high=model.evaluate(pb=18,cd=2.1,zn=2,ph=6.8,ap=1)
    assert low['category']=='низький'
    assert abs(low['score']-low_high_ap['score']) < 1e-9
    assert at_gdk['score'] < acid_at_gdk['score']
    assert lead_high['score'] < lead_high_acid['score']
    assert lead_high['score'] < two_high['score']
    assert 0 <= two_high['score'] <= 10

def test_domain_and_nonfinite(model):
    for kwargs in ({'pb':30.1,'cd':.1,'zn':1,'ph':6,'ap':2},
                   {'pb':1,'cd':-1,'zn':1,'ph':6,'ap':2},
                   {'pb':1,'cd':.1,'zn':1,'ph':float('nan'),'ap':2}):
        with pytest.raises(ValueError): model.evaluate(**kwargs)

def test_other_input_context_effect(model):
    neutral=model.evaluate(pb=6,cd=.7,zn=23,ph=6.8,ap=1)['score']
    high_ap=model.evaluate(pb=6,cd=.7,zn=23,ph=6.8,ap=9)['score']
    acid=model.evaluate(pb=6,cd=.7,zn=23,ph=4.5,ap=1)['score']
    assert neutral < high_ap
    assert neutral < acid


def test_matlab_101_sampling(model):
    matlab_like=SoilFuzzyModel(sample_points=101)
    xx=dict(pb=6,cd=.7,zn=23,ph=6.8,ap=1)
    assert abs(model.evaluate(**xx)['score']-matlab_like.evaluate(**xx)['score']) < .07
