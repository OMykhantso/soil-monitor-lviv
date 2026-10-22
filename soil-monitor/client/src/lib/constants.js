export const CATEGORIES = {
  low: { label: 'Низький', color: 'var(--lv-low)' },
  moderate: { label: 'Помірний', color: 'var(--lv-mod)' },
  high: { label: 'Високий', color: 'var(--lv-high)' },
  critical: { label: 'Критичний', color: 'var(--lv-crit)' },
};
export const STATUS_LABEL = {
  assessed: 'Оцінено', not_assessed: 'Повні дані, не оцінено', incomplete: 'Неповні дані', no_data: 'Немає вимірювань',
};
// Нормативи рухомих форм (розділ 2.2): Pb 6, Cd 0.7, Zn 23 мг/кг
export const GDK = { pb: 6, cd: 0.7, zn: 23 };
export const DOMAIN = { pb: [0, 30], cd: [0, 3.5], zn: [0, 115], ph: [3, 10], ap: [0, 10] };
export const INDICATORS = [
  { key: 'pb', label: 'Pb', unit: 'мг/кг', digits: 2 },
  { key: 'cd', label: 'Cd', unit: 'мг/кг', digits: 2 },
  { key: 'zn', label: 'Zn', unit: 'мг/кг', digits: 2 },
  { key: 'ph', label: 'pH', unit: '', digits: 1 },
  { key: 'ap', label: 'AP', unit: 'бал', digits: 0 },
];
// AP — сума п'яти експертних критеріїв (0 — немає, 1 — помірний вплив, 2 — значний вплив).
// Назви критеріїв узгодьте з підрозділом 2.2 МКР; ключі збігаються з серверними (AP_KEYS).
export const AP_CRITERIA = [
  { key: 'industrial', label: 'Промислові об’єкти та енергетика поблизу' },
  { key: 'transport', label: 'Транспортне навантаження (автошляхи, залізниця)' },
  { key: 'waste', label: 'Відходи: полігони, звалища, хвостосховища' },
  { key: 'mining', label: 'Гірничодобувна діяльність, відвали' },
  { key: 'agricultural', label: 'Інтенсивне сільськогосподарське навантаження' },
];
export const LAND_USE = {
  agricultural: 'Сільськогосподарські угіддя', industrial: 'Промислова зона', urban: 'Міська забудова', transport: 'Транспортний коридор',
  waste: 'Поводження з відходами', mining: 'Гірничодобувна', forest: 'Ліс', other: 'Інше',
};
export const SOURCE_STATUS = { none: 'Немає', suspected: 'Ймовірне', confirmed: 'Підтверджене', unknown: 'Невідомо' };
export const LOCATION_TYPE = {
  sampling_site: 'Точка відбору', settlement: 'Населений пункт (поле не локалізоване)', district_average: 'Середнє по району',
};
export const SITE_KEYS = [
  ['contamination_confirmed', 'Забруднення підтверджене лабораторно'],
  ['measurement_uncertain', 'Дані вимірювань невизначені / застарілі'],
  ['exposure_pathway_present', 'Є шлях експозиції людей'],
  ['plant_growth_suitable', 'Умови придатні для росту рослин'],
  ['bioavailability_assessed', 'Біодоступність металів оцінено'],
  ['soil_properties_known', 'Властивості ґрунту відомі'],
  ['amendment_tested', 'Добавки-іммобілізатори випробувано'],
  ['grain_size_known', 'Гранулометричний склад відомий'],
  ['washing_feasibility_tested', 'Придатність промивання випробувано'],
  ['localized_extent_confirmed', 'Локальні межі забруднення встановлено'],
  ['disposal_route_known', 'Шлях поводження з вилученим ґрунтом відомий'],
];
export const SITE_LABEL = Object.fromEntries([...SITE_KEYS, ['source_status', 'Статус джерела'], ['ph_acidic', 'Кислий ґрунт'], ['category_low', 'Категорія «низький»']]);
export const SUIT = { potentially_suitable: 'Потенційно придатний', needs_data: 'Потребує додаткових даних', incompatible: 'Невідповідний' };
export const METHOD_CAT = { monitoring: 'Моніторинг', prevention: 'Превентивний захід', remediation: 'Ремедіація' };
export const ROLE = { admin: 'Адміністратор', specialist: 'Фахівець', viewer: 'Перегляд' };
export const fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(d).replace('.', ','));
export const fmtDate = (s) => (s ? new Date(s + (s.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('uk-UA') : '—');
export const CATEGORY_CODE_FROM_UK = { 'низький': 'low', 'помірний': 'moderate', 'високий': 'high', 'критичний': 'critical' };
