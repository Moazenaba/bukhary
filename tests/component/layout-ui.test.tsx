// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilterChips } from '../../src/components/ui/FilterChips';
import { Modal } from '../../src/components/ui/Modal';
import { TableScroll } from '../../src/components/ui/TableScroll';

afterEach(cleanup);

describe('FilterChips', () => {
  it('wraps instead of scrolling and is a labelled group', () => {
    render(<FilterChips label="المراحل"><button>أ</button><button>ب</button></FilterChips>);
    const group = screen.getByRole('group', { name: 'المراحل' });
    expect(group.className).toContain('flex-wrap');
    expect(group.className).not.toContain('overflow-x');
  });
});

describe('Modal', () => {
  it('is a dialog with a title, never taller than the window, and closes on Esc and the backdrop', () => {
    const onClose = vi.fn();
    const { container } = render(<Modal title="عنوان" onClose={onClose}>محتوى</Modal>);
    const dialog = screen.getByRole('dialog', { name: 'عنوان' });
    expect(dialog.className).toContain('max-h-[92vh]');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(container.firstElementChild as Element);
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.mouseDown(dialog);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('can be told not to close on the backdrop', () => {
    const onClose = vi.fn();
    const { container } = render(<Modal title="ت" onClose={onClose} closeOnBackdrop={false}>x</Modal>);
    fireEvent.mouseDown(container.firstElementChild as Element);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('TableScroll', () => {
  it('marks the scroll area and shows no arrows when everything fits', () => {
    render(<TableScroll label="الدورة"><table><tbody><tr><td>x</td></tr></tbody></table></TableScroll>);
    const region = screen.getByRole('region', { name: 'الدورة' });
    expect(region.hasAttribute('data-scroll')).toBe(true);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows an arrow when there is more to the side', () => {
    const { container } = render(<TableScroll><div style={{ width: 2000 }}>wide</div></TableScroll>);
    const region = container.querySelector('[data-scroll]') as HTMLElement;
    Object.defineProperty(region, 'scrollWidth', { value: 2000, configurable: true });
    Object.defineProperty(region, 'clientWidth', { value: 800, configurable: true });
    region.scrollLeft = 0;
    fireEvent.scroll(region);
    // LTR in jsdom: at the start there is more to the right.
    expect(screen.getByRole('button', { name: 'المزيد جهة اليمين' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'المزيد جهة اليسار' })).toBeNull();
  });
});
