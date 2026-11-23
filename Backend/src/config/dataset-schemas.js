// Single source of truth for the datasets an admin may upload.
// The frontend fetches this via GET /api/admin/dataset-types so both sides always agree.
// Column kinds: 'string' | 'number'. Columns listed in `required` must be present in the
// CSV header and non-empty in every row; every other known column may be blank (stored as null).

const MAX_CHUNK_ROWS = 1000;
const MAX_TOTAL_ROWS = 250000;

const DATASET_TYPES = {
  merged: {
    label: 'ชุดข้อมูลรวม (Merged)',
    description: 'ข้อมูลรวมฝน/น้ำท่วม/ความชื้น/ระดับน้ำในแม่น้ำ/ระดับน้ำทะเล ใช้ฝึกโมเดลโดยตรง',
    required: [
      'province', 'district', 'district_code', 'year', 'month', 'month_start',
      'flooded', 'flood_status', 'flood_events_month',
      'monthly_rain_total_mm', 'monthly_rain_daily_max_mm', 'river_mean_depth_m_weighted',
    ],
    columns: {
      province: 'string', district: 'string', district_code: 'string', month_start: 'string',
      flood_status: 'string', year: 'number', month: 'number',
      monthly_rain_total_mm: 'number', monthly_rain_daily_max_mm: 'number', monthly_rain_daily_min_mm: 'number',
      flooded: 'number', flood_events_month: 'number', flood_windows: 'number', max_flood_ha: 'number',
      flood_events_year_once_per_district: 'number',
      humidity_mean_rh_pct: 'number', humidity_mean_q_gkg: 'number', humidity_mean_dewpoint_c: 'number',
      humidity_mean_temp_c: 'number', humidity_daily_rain_total_mm: 'number', humidity_daily_rain_max_mm: 'number',
      humidity_heavy_days: 'number', humidity_heavy_flag_valid_days: 'number', humidity_days_in_month: 'number',
      river_discharge_scale: 'number', river_mean_depth_m_weighted: 'number', river_precip_base_mm: 'number',
      river_precip_mm: 'number', river_length_km: 'number', river_segments: 'number',
      river_surface_area_km2: 'number', river_water_volume_mcm: 'number',
      sea_level_ssh_cmems_mean_m: 'number', sea_level_ssh_cmems_max_m: 'number', sea_level_ssh_cmems_min_m: 'number',
      sea_level_ssh_hycom_mean_m: 'number', sea_level_ssh_hycom_max_m: 'number', sea_level_ssh_hycom_min_m: 'number',
    },
  },
  flood: {
    label: 'น้ำท่วมรายเดือน (อำเภอ)',
    description: 'สถานะและเหตุการณ์น้ำท่วมรายเดือนของแต่ละอำเภอ',
    required: ['province', 'amphoe', 'year', 'month', 'flooded', 'flood_status'],
    columns: {
      province: 'string', amphoe: 'string', month_start: 'string', month_th: 'string', flood_status: 'string',
      year: 'number', month: 'number', flooded: 'number', flood_events_month: 'number', flood_windows: 'number',
      max_flood_ha: 'number', flood_events_year: 'number',
    },
  },
  rain: {
    label: 'ปริมาณฝนรายเดือน (อำเภอ)',
    description: 'ปริมาณฝนรวม สูงสุด และต่ำสุดรายวันของแต่ละเดือน',
    required: ['province', 'amphoe', 'year', 'month', 'rain_total_mm'],
    columns: {
      province: 'string', amphoe: 'string', date_month: 'string', month_th: 'string',
      year: 'number', month: 'number', rain_total_mm: 'number', rain_daily_max_mm: 'number', rain_daily_min_mm: 'number',
    },
  },
  humidity: {
    label: 'ความชื้นรายวัน',
    description: 'ความชื้นสัมพัทธ์ อุณหภูมิ และฝนรายวันของแต่ละอำเภอ',
    required: ['province', 'district', 'district_code', 'date', 'rh_pct'],
    columns: {
      province: 'string', district: 'string', district_code: 'string', date: 'string', month_start: 'string',
      year: 'number', month: 'number', rh_pct: 'number', q_gkg: 'number', dewpoint_c: 'number',
      temp_c: 'number', rain_mm: 'number', heavy: 'number',
    },
  },
  river: {
    label: 'ปริมาณน้ำในแม่น้ำรายเดือน',
    description: 'ความลึกเฉลี่ย ปริมาตรน้ำ และข้อมูลลำน้ำของแต่ละอำเภอ',
    required: ['province', 'district', 'district_code', 'year', 'month', 'mean_depth_m_weighted'],
    columns: {
      province: 'string', district: 'string', district_code: 'string', month_th: 'string',
      year: 'number', month: 'number', discharge_scale: 'number', mean_depth_m_weighted: 'number',
      precip_base_mm: 'number', precip_mm: 'number', river_length_km: 'number', river_segments: 'number',
      river_surface_area_km2: 'number', river_water_volume_mcm: 'number',
    },
  },
  sea_level: {
    label: 'ระดับน้ำทะเลรายเดือน',
    description: 'ค่าระดับน้ำทะเลจาก CMEMS และ HYCOM',
    required: ['province', 'district', 'district_code', 'year', 'month'],
    columns: {
      province: 'string', district: 'string', district_code: 'string', month_th: 'string', month_start: 'string',
      year: 'number', month: 'number',
      ssh_cmems_mean_m: 'number', ssh_cmems_max_m: 'number', ssh_cmems_min_m: 'number',
      ssh_hycom_mean_m: 'number', ssh_hycom_max_m: 'number', ssh_hycom_min_m: 'number',
    },
  },
};

function listDatasetTypes() {
  return Object.entries(DATASET_TYPES).map(([id, definition]) => ({
    id,
    label: definition.label,
    description: definition.description,
    required: definition.required,
    columns: Object.entries(definition.columns).map(([name, kind]) => ({ name, kind })),
  }));
}

module.exports = { DATASET_TYPES, MAX_CHUNK_ROWS, MAX_TOTAL_ROWS, listDatasetTypes };
