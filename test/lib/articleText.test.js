import { expect, it } from 'vitest'
import { cleanArticleText } from '../../src/lib/articleText.js'

it('removes share widgets and repeated embed controls from cached article text', () => {
  const input = 'Facebook\n\nWhatsapp\n\nReddit\n\nPinterest\n\nFlipboard\n\nEmail\n\nThe company launched a new product.\n\nView Original\n\nView Original\n\nRevenue increased 12% to $20 million.'
  expect(cleanArticleText(input)).toBe('The company launched a new product.\n\nRevenue increased 12% to $20 million.')
})

it('preserves prose, quotes, links and legitimate standalone headings', () => {
  const input = 'Email\n\nEmail revenue increased 12%. Facebook reported higher advertising sales.\n\n“View Original” is the label the author discussed.\n\nhttps://example.test/report\n\n邮件业务收入增长。'
  expect(cleanArticleText(input)).toBe(input)
})

it('handles adjacent widget lines and does not change clean text on repeated passes', () => {
  const input = 'Lead paragraph.\n\nFacebook\nWhatsApp\nEmail\n\nView Original\n\nSecond paragraph.'
  const cleaned = cleanArticleText(input)
  expect(cleaned).toBe('Lead paragraph.\n\nSecond paragraph.')
  expect(cleanArticleText(cleaned)).toBe(cleaned)
})
