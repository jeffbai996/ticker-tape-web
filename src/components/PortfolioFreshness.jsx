import {getLocale} from '../lib/i18n.js'
import {portfolioDataTimes} from '../lib/portfolioData.js'

export function dataTime(seconds) {
 if(!Number.isFinite(seconds) || seconds<=0)return '—'
 return new Date(seconds*1000).toLocaleString(getLocale()==='zh' ? 'zh-CN' : 'en-CA',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})
}
export function PortfolioFreshness({portfolio,quotes,ccys,fxLive,history}) {
 const zh=getLocale()==='zh',times=portfolioDataTimes(portfolio.holdings,quotes,ccys || [],portfolio.ccy,fxLive)
 const t=(en,cn)=>zh ? cn : en
 const status=history.data?.status,global=history.data?.collector
 const failed=history.error || (status && status.state!=='complete') || (global && global.state!=='complete')
 const statusAt=Math.max(status?.checkedAt || 0,global?.checkedAt || 0)
 const late=statusAt>0 && Date.now()/1000-statusAt>5400
 const statusWord=history.pending ? t('Loading history','正在读取历史') : failed ? t('Collection incomplete','采集不完整') : !status ? t('Awaiting collection','等待采集') : late ? t('Collection delayed','采集延迟') : t('Collected','已采集')
 return <div data-portfolio-freshness class="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2 font-mono text-[9px] text-muted">
  <span>{t('Prices (oldest)','价格（最早）')} {dataTime(times.price)}{times.missing>0 && ` · ${times.missing} ${t('unavailable','暂无时间')}`}</span>
  {times.fxNeeded && <span>{t('FX (oldest)','汇率（最早）')} {dataTime(times.fx)}{times.fxMissing>0 && ` · ${t('incomplete','不完整')}`}</span>}
  {history.configured && <button type="button" onClick={history.refresh} class={`${failed ? 'text-accent' : ''} hover:text-ink`} aria-label={t('Refresh collected history','刷新采集历史')}>{statusWord} {dataTime(statusAt)} ↻</button>}
 </div>
}
