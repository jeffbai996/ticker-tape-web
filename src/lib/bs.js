// Black-Scholes delta — Yahoo's chain gives IV but no greeks, so we derive
// delta from IV. Abramowitz-Stegun erf approximation (~1e-7 accuracy, plenty
// for a display column).

export function normCdf(x) {
  const z = x / Math.SQRT2   // Φ(x) = (1 + erf(x/√2)) / 2
  const t = 1 / (1 + 0.3275911 * Math.abs(z))
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z)
  return 0.5 * (1 + Math.sign(z) * erf)
}

export function bsDelta({ spot, strike, t, iv, rate = 0.04, type }) {
  if (!spot || !strike || !t || !iv || t <= 0 || iv <= 0) return null
  const d1 = (Math.log(spot / strike) + (rate + (iv * iv) / 2) * t) / (iv * Math.sqrt(t))
  const call = normCdf(d1)
  return type === 'put' ? call - 1 : call
}
