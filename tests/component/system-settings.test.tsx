// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemSettingsModal } from '../../src/components/SystemSettingsModal';
import { DataService } from '../../src/services/DataService';
import { DEFAULT_SETTINGS } from '../../src/types';
import { grant } from './setup';

function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SystemSettingsModal onClose={() => {}} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  grant(['settings.write']);
  vi.spyOn(DataService, 'getSettings').mockResolvedValue({ ...DEFAULT_SETTINGS, observers: ['أحمد', 'محمد'] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('«إعدادات النظام»', () => {
  it('shows the stored names, one per line', async () => {
    open();
    const box = (await screen.findByRole('textbox', { name: 'مراقبو الامتحانات' })) as HTMLTextAreaElement;
    await waitFor(() => expect(box.value).toBe('أحمد\nمحمد'));
  });

  it('saves a name list without blanks or repeats, when leaving the box', async () => {
    const save = vi.spyOn(DataService, 'saveSetting').mockResolvedValue(undefined as any);
    open();
    const box = (await screen.findByRole('textbox', { name: 'مراقبو الامتحانات' })) as HTMLTextAreaElement;
    await waitFor(() => expect(box.value).toBe('أحمد\nمحمد'));
    fireEvent.change(box, { target: { value: 'أحمد\n\n  علي  \nأحمد\nمحمد' } });
    expect(save).not.toHaveBeenCalled();
    fireEvent.blur(box);
    await waitFor(() => expect(save).toHaveBeenCalledWith('observers', ['أحمد', 'علي', 'محمد']));
  });

  it('an unchanged field sends nothing; numbers are kept in range', async () => {
    const save = vi.spyOn(DataService, 'saveSetting').mockResolvedValue(undefined as any);
    open();
    const hours = (await screen.findByLabelText('ساعات إتاحة ورقة الامتحان قبل موعده')) as HTMLInputElement;
    fireEvent.blur(hours);
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(hours, { target: { value: '5000' } });
    fireEvent.blur(hours);
    await waitFor(() => expect(save).toHaveBeenCalledWith('exam_open_hours_before', 720));
  });
});
