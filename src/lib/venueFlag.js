// Venue → country flag for search autocomplete. Real flag-icons SVGs, bundled
// same-origin as separate files, fetched only for displayed flags, so the
// initial JavaScript does not embed the entire flag set and the CSP never phones out (Jeff 2026-08-09: "high res .svg
// country flags for venue country").
//
// Resolution order: the Yahoo exchange display name, then the symbol's venue
// suffix (.TO, .L, .DE…) — names cover the US venues that carry no suffix,
// suffixes cover everything Yahoo labels inconsistently.

import us from 'flag-icons/flags/4x3/us.svg?no-inline'
import ca from 'flag-icons/flags/4x3/ca.svg?no-inline'
import gb from 'flag-icons/flags/4x3/gb.svg?no-inline'
import de from 'flag-icons/flags/4x3/de.svg?no-inline'
import fr from 'flag-icons/flags/4x3/fr.svg?no-inline'
import nl from 'flag-icons/flags/4x3/nl.svg?no-inline'
import it from 'flag-icons/flags/4x3/it.svg?no-inline'
import es from 'flag-icons/flags/4x3/es.svg?no-inline'
import ch from 'flag-icons/flags/4x3/ch.svg?no-inline'
import se from 'flag-icons/flags/4x3/se.svg?no-inline'
import no from 'flag-icons/flags/4x3/no.svg?no-inline'
import dk from 'flag-icons/flags/4x3/dk.svg?no-inline'
import fi from 'flag-icons/flags/4x3/fi.svg?no-inline'
import at from 'flag-icons/flags/4x3/at.svg?no-inline'
import be from 'flag-icons/flags/4x3/be.svg?no-inline'
import pt from 'flag-icons/flags/4x3/pt.svg?no-inline'
import ie from 'flag-icons/flags/4x3/ie.svg?no-inline'
import pl from 'flag-icons/flags/4x3/pl.svg?no-inline'
import jp from 'flag-icons/flags/4x3/jp.svg?no-inline'
import hk from 'flag-icons/flags/4x3/hk.svg?no-inline'
import cn from 'flag-icons/flags/4x3/cn.svg?no-inline'
import tw from 'flag-icons/flags/4x3/tw.svg?no-inline'
import kr from 'flag-icons/flags/4x3/kr.svg?no-inline'
import inn from 'flag-icons/flags/4x3/in.svg?no-inline'
import sg from 'flag-icons/flags/4x3/sg.svg?no-inline'
import my from 'flag-icons/flags/4x3/my.svg?no-inline'
import id from 'flag-icons/flags/4x3/id.svg?no-inline'
import th from 'flag-icons/flags/4x3/th.svg?no-inline'
import au from 'flag-icons/flags/4x3/au.svg?no-inline'
import nz from 'flag-icons/flags/4x3/nz.svg?no-inline'
import br from 'flag-icons/flags/4x3/br.svg?no-inline'
import mx from 'flag-icons/flags/4x3/mx.svg?no-inline'
import ar from 'flag-icons/flags/4x3/ar.svg?no-inline'
import cl from 'flag-icons/flags/4x3/cl.svg?no-inline'
import il from 'flag-icons/flags/4x3/il.svg?no-inline'
import za from 'flag-icons/flags/4x3/za.svg?no-inline'
import sa from 'flag-icons/flags/4x3/sa.svg?no-inline'
import tr from 'flag-icons/flags/4x3/tr.svg?no-inline'
import gr from 'flag-icons/flags/4x3/gr.svg?no-inline'

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
