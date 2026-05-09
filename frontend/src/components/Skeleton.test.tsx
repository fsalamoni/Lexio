// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Skeleton, SkeletonCard, SkeletonItem, SkeletonRow } from './Skeleton'

afterEach(() => {
  cleanup()
})

describe('Skeleton', () => {
  it('renders the base skeleton primitive with custom classes', () => {
    const { container } = render(<Skeleton className="h-4 w-20 rounded" />)
    expect(container.querySelector('.skeleton')).toBeTruthy()
    expect(container.querySelector('.rounded')).toBeTruthy()
  })

  it('renders row, card, and item skeleton variants with the expected placeholders', () => {
    const { container } = render(
      <div>
        <table>
          <tbody>
            <SkeletonRow cols={3} />
          </tbody>
        </table>
        <SkeletonCard />
        <SkeletonItem />
      </div>,
    )

    expect(container.querySelectorAll('td')).toHaveLength(3)
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThanOrEqual(10)
    expect(container.querySelectorAll('.rounded-xl').length).toBeGreaterThan(0)
  })
})