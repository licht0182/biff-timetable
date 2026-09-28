import { expect, test } from '@playwright/test'

test.use({ serviceWorkers: 'allow' })

test('keeps films and docent text available when an installed app goes offline', async ({ page, context }) => {
  await page.goto('./')
  await expect(page.locator('.film-card').first()).toBeVisible()
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active))
  await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))

  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.film-card').first()).toBeVisible()
  await page.getByRole('button', { name: 'AI 도슨트' }).click()
  const gallery = page.getByRole('region', { name: '감독의 시선으로 고르는 영화' })
  await expect(gallery).toBeVisible()
  await gallery.scrollIntoViewIfNeeded()
  await expect(gallery.locator('.curator-gallery-image-fallback')).toBeVisible()
  await expect(gallery.getByRole('button', { name: '칼럼 읽기' })).toBeVisible()
})
