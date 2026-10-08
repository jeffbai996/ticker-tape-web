// Corrections for upstream US-directory entries that are missing or attached
// to the wrong symbol. Keep these in the generated table's load path as well
// as in its generator so the lookup stays correct between full rebuilds.
export const ZH_NAME_OVERRIDES = {
  GOOGL: ['谷歌'],
}

// The short names Chinese tapes print where the directory's name is a long
// corporate one, English, or missing (Jeff 2026-10-08: "use the short names for
// TSM AMD and whatever else"). Tape only; the portfolio keeps the full name.
export const ZH_SHORT_NAMES = {
  TSM: '台积电',
  AMD: '超威半导体',
  ADM: '阿彻丹尼尔斯',
  ADBE: '奥多比',
  BAM: '博枫资管',
  'BRK-B': '伯克希尔B',
  RY: '皇家银行',
  GLD: 'SPDR黄金',
  SOXX: '半导体ETF',
  TLT: '20年美债',
}
