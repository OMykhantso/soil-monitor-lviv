-- Виконувати ПІСЛЯ запуску FIS і створення fuzzy_assessments для measurement_id=9001.
-- Це контрольний приклад записів, а НЕ результат виконання LLM.
-- Замініть :assessment_id реальним ID (у psql можна \set assessment_id 123).
BEGIN;
WITH inserted AS (
 INSERT INTO strategy_sets(assessment_id,status,selection_engine,is_demo)
 VALUES (:assessment_id,'demo','manual_review_example_v1',TRUE)
 RETURNING id
)
INSERT INTO strategy_alternatives(strategy_set_id,method_id,rank,suitability_status,explanation,missing_data,is_demo)
SELECT inserted.id,m.id,v.rank,v.status,v.explanation,v.missing_data,TRUE
FROM inserted CROSS JOIN (VALUES
 ('MONITOR',1,'potentially_suitable','Повторне вимірювання уточнить синтетичні показники та джерело їх отримання.',ARRAY[]::TEXT[]),
 ('SOURCE',2,'potentially_suitable','Наявне лише припущення про джерело; необхідна його перевірка.',ARRAY[]::TEXT[]),
 ('IMMOB',3,'needs_data','Метод можливий лише після характеристики ґрунту й лабораторного випробування добавок.',ARRAY['contamination_confirmed','soil_properties_known','amendment_tested']::TEXT[])
) AS v(code,rank,status,explanation,missing_data)
JOIN remediation_methods m ON m.code=v.code;
COMMIT;
