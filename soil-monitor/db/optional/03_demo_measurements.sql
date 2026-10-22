BEGIN;
INSERT INTO monitoring_locations(id,name,latitude,longitude,land_use,source_status,description,is_demo) VALUES
(9001,'DEMO-A (умовна точка)',49.840000,24.030000,'industrial','suspected','Синтетична демонстраційна точка; координати умовні',TRUE),
(9002,'DEMO-B (умовна точка)',49.800000,24.010000,'agricultural','unknown','Синтетична демонстраційна точка; координати умовні',TRUE)
ON CONFLICT(id) DO NOTHING;
INSERT INTO soil_measurements(id,location_id,sample_date,pb,cd,zn,ph,ap,ph_method,metal_extraction_method,provenance,is_demo) VALUES
(9001,9001,'2026-01-15',9,0.98,12,5.1,8,'DEMO: не встановлено','DEMO: не встановлено','SYNTHETIC TEST DATA – НЕ лабораторний результат',TRUE),
(9002,9002,'2026-01-16',1,0.15,1,6.8,1,'DEMO: не встановлено','DEMO: не встановлено','SYNTHETIC TEST DATA – НЕ лабораторний результат',TRUE)
ON CONFLICT(id) DO NOTHING;
-- УВАГА: оцінки FIS не заповнені вигаданими числами. Їх має обчислити Python-модель.
COMMIT;
