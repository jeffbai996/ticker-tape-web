// Venue → country flag for search autocomplete. Real flag-icons SVGs, bundled
// same-origin so the CSP never phones out (Jeff 2026-08-09: "high res .svg
// country flags for venue country").
//
// Resolution order: the Yahoo exchange display name, then the symbol's venue
// suffix (.TO, .L, .DE…) — names cover the US venues that carry no suffix,
// suffixes cover everything Yahoo labels inconsistently.

import us from 'flag-icons/flags/4x3/us.svg'
import ca from 'flag-icons/flags/4x3/ca.svg'
import gb from 'flag-icons/flags/4x3/gb.svg'
import de from 'flag-icons/flags/4x3/de.svg'
import fr from 'flag-icons/flags/4x3/fr.svg'
import nl from 'flag-icons/flags/4x3/nl.svg'
import it from 'flag-icons/flags/4x3/it.svg'
import es from 'flag-icons/flags/4x3/es.svg'
import ch from 'flag-icons/flags/4x3/ch.svg'
import se from 'flag-icons/flags/4x3/se.svg'
import no from 'flag-icons/flags/4x3/no.svg'
import dk from 'flag-icons/flags/4x3/dk.svg'
import fi from 'flag-icons/flags/4x3/fi.svg'
import at from 'flag-icons/flags/4x3/at.svg'
import be from 'flag-icons/flags/4x3/be.svg'
import pt from 'flag-icons/flags/4x3/pt.svg'
import ie from 'flag-icons/flags/4x3/ie.svg'
import pl from 'flag-icons/flags/4x3/pl.svg'
import jp from 'flag-icons/flags/4x3/jp.svg'
import hk from 'flag-icons/flags/4x3/hk.svg'
import cn from 'flag-icons/flags/4x3/cn.svg'
import tw from 'flag-icons/flags/4x3/tw.svg'
import kr from 'flag-icons/flags/4x3/kr.svg'
import inn from 'flag-icons/flags/4x3/in.svg'
import sg from 'flag-icons/flags/4x3/sg.svg'
import my from 'flag-icons/flags/4x3/my.svg'
import id from 'flag-icons/flags/4x3/id.svg'
import th from 'flag-icons/flags/4x3/th.svg'
import au from 'flag-icons/flags/4x3/au.svg'
import nz from 'flag-icons/flags/4x3/nz.svg'
import br from 'flag-icons/flags/4x3/br.svg'
import mx from 'flag-icons/flags/4x3/mx.svg'
import ar from 'flag-icons/flags/4x3/ar.svg'
import cl from 'flag-icons/flags/4x3/cl.svg'
import il from 'flag-icons/flags/4x3/il.svg'
import za from 'flag-icons/flags/4x3/za.svg'
import sa from 'flag-icons/flags/4x3/sa.svg'
import tr from 'flag-icons/flags/4x3/tr.svg'
import gr from 'flag-icons/flags/4x3/gr.svg'

const FLAGS = {
  us, ca, gb, de, fr, nl, it, es, ch, se, no, dk, fi, at, be, pt, ie, pl,
  jp, hk, cn, tw, kr, in: inn, sg, my, id, th, au, nz, br, mx, ar, cl,
  il, za, sa, tr, gr,
}

// Yahoo exchDisp fragments, matched case-insensitively.
const EXCH_COUNTRY = [
  [/nasdaq|nyse|amex|otc|cboe|bats|chicago|pink/i, 'us'],
  [/toronto|tsx|cse|canadian|neo\b/i, 'ca'],
  [/london|lse\b/i, 'gb'],
  [/xetra|frankfurt|stuttgart|munich|berlin|hamburg|d(ü|u)sseldorf/i, 'de'],
  [/paris/i, 'fr'],
  [/amsterdam/i, 'nl'],
  [/milan/i, 'it'],
  [/madrid|mce\b/i, 'es'],
  [/swiss|zurich/i, 'ch'],
  [/stockholm|nordic/i, 'se'],
  [/oslo/i, 'no'],
  [/copenhagen/i, 'dk'],
  [/helsinki/i, 'fi'],
  [/vienna/i, 'at'],
  [/brussels/i, 'be'],
  [/lisbon/i, 'pt'],
  [/dublin|irish/i, 'ie'],
  [/warsaw/i, 'pl'],
  [/tokyo|osaka|jasdaq|japan/i, 'jp'],
  [/hkse|hong ?kong/i, 'hk'],
  [/shanghai|shenzhen/i, 'cn'],
  [/taiwan|tsec|tpex/i, 'tw'],
  [/kse\b|kosdaq|korea/i, 'kr'],
  [/nse\b|bse\b|bombay|india/i, 'in'],
  [/ses\b|singapore/i, 'sg'],
  [/klse|kuala/i, 'my'],
  [/jakarta/i, 'id'],
  [/thailand|set\b/i, 'th'],
  [/asx|australian/i, 'au'],
  [/nzse|zealand/i, 'nz'],
  [/s(ã|a)o paulo|bovespa/i, 'br'],
  [/mexico/i, 'mx'],
  [/buenos aires/i, 'ar'],
  [/santiago/i, 'cl'],
  [/tel aviv/i, 'il'],
  [/johannesburg/i, 'za'],
  [/saudi|tadawul/i, 'sa'],
  [/istanbul/i, 'tr'],
  [/athens/i, 'gr'],
]

// Venue suffixes (the part after the last dot in "7203.T", "SHOP.TO", "SAP.DE").
const SUFFIX_COUNTRY = {
  TO: 'ca', V: 'ca', CN: 'ca', NE: 'ca',
  L: 'gb', IL: 'gb',
  DE: 'de', F: 'de', SG: 'de', MU: 'de', BE: 'de', DU: 'de', HM: 'de',
  PA: 'fr', AS: 'nl', MI: 'it', MC: 'es', SW: 'ch', VX: 'ch',
  ST: 'se', OL: 'no', CO: 'dk', HE: 'fi', VI: 'at', BR: 'be', LS: 'pt',
  IR: 'ie', WA: 'pl',
  T: 'jp', OS: 'jp', HK: 'hk', SS: 'cn', SZ: 'cn', TW: 'tw', TWO: 'tw',
  KS: 'kr', KQ: 'kr', NS: 'in', BO: 'in', SI: 'sg', KL: 'my', JK: 'id',
  BK: 'th', AX: 'au', NZ: 'nz', SA: 'br', MX: 'mx', BA: 'ar', SN: 'cl',
  TA: 'il', JO: 'za', IS: 'tr', AT: 'gr',
}

/** Bundled flag URL for a search hit, or null when the venue is unknown. */
export function venueFlag({ exch = '', symbol = '' } = {}) {
  for (const [re, cc] of EXCH_COUNTRY) {
    if (re.test(exch)) return FLAGS[cc] || null
  }
  const dot = symbol.lastIndexOf('.')
  if (dot > 0) {
    const cc = SUFFIX_COUNTRY[symbol.slice(dot + 1).toUpperCase()]
    if (cc) return FLAGS[cc] || null
  }
  // suffix-less symbols on Yahoo default to a US venue
  return /^[A-Z0-9^=-]+$/.test(symbol) && !symbol.includes('=') ? FLAGS.us : null
}
