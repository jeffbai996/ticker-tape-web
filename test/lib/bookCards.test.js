/** Nine analytics cards is more than most books want on screen at once, so
 *  they are individually hideable (Jeff 2026-08-21: "if we add a ton then add
 *  a way for user to hide em"). What is stored is the HIDDEN set, so a card
 *  added in a later release shows up for everyone instead of staying dark
 *  until they go looking for it.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  BOOK_CARDS, hiddenCards, isCardShown, resetCards, toggleCard,
} from '../../src/lib/bookCards.js'

beforeEach(() => localStorage.clear())

describe('the card registry', () => {
  it('gives every card a stable id and a label', () => {
    expect(BOOK_CARDS.length).toBeGreaterThan(5)
    const ids = BOOK_CARDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of BOOK_CARDS) {
      expect(c.id).toMatch(/^[a-z][a-z0-9]*$/)
      expect(c.label.length).toBeGreaterThan(2)
    }
  })
})

describe('showing and hiding', () => {
  it('shows everything on a fresh browser', () => {
    expect(hiddenCards()).toEqual([])
    for (const c of BOOK_CARDS) expect(isCardShown(c.id)).toBe(true)
  })

  it('a new card ships visible even to a browser that hid others', () => {
    toggleCard(BOOK_CARDS[0].id)
    expect(isCardShown('somethingaddedlater')).toBe(true)
  })

  it('toggles one card and persists it', () => {
    const id = BOOK_CARDS[1].id
    expect(toggleCard(id)).toEqual([id])
    expect(isCardShown(id)).toBe(false)
    expect(toggleCard(id)).toEqual([])
    expect(isCardShown(id)).toBe(true)
  })

  it('drops ids that are no longer cards instead of carrying them forever', () => {
    localStorage.setItem('my_portfolio_cards_v1', JSON.stringify(['weights', 'retiredcard']))
    expect(hiddenCards()).toEqual(['weights'])
  })

  it('survives corrupted storage and resets on request', () => {
    localStorage.setItem('my_portfolio_cards_v1', '{not json')
    expect(hiddenCards()).toEqual([])
    toggleCard(BOOK_CARDS[0].id)
    resetCards()
    expect(hiddenCards()).toEqual([])
  })
})
