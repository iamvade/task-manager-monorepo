import type { PublicFeedbackUpload } from '@kite/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client';
import { removePublicFeedbackUpload, uploadPublicFeedbackFile } from '../../../api/feedback';
import type * as FeedbackApi from '../../../api/feedback';
import i18n from '../../../i18n';
import { createQueryClient } from '../../../queryClient';
import { mockApi } from '../../../test/fixtures';
import { PublicFeedbackPage } from './PublicFeedbackPage';

vi.mock('../../../api/feedback', async (importOriginal) => ({
  ...(await importOriginal<typeof FeedbackApi>()),
  uploadPublicFeedbackFile: vi.fn(),
  removePublicFeedbackUpload: vi.fn(() => Promise.resolve(null)),
}));

const SLUG = 'kite-studio';
const FORM = {
  workspaceName: 'Kite Studio',
  maxFiles: 5,
  maxFileBytes: 10 * 1024 * 1024,
  mimeTypes: ['image/png', 'image/jpeg', 'video/mp4', 'video/quicktime', 'application/pdf'],
};
const RESULT = {
  ref: 'FB-1047',
  type: 'bug',
  title: 'The Pay button freezes',
  attachmentCount: 1,
  email: 'nomin.b@gmail.com',
  createdAt: '2026-10-19T03:00:00.000Z',
};

type Handler = (init?: RequestInit) => Response | Promise<Response>;

function renderPage(extra: Record<string, Handler> = {}) {
  const fetchMock = mockApi({
    [`GET /api/v1/public/feedback/${SLUG}`]: () => Response.json(FORM),
    ...extra,
  });
  const router = createMemoryRouter([{ path: '/feedback/:slug', Component: PublicFeedbackPage }], {
    initialEntries: [`/feedback/${SLUG}`],
  });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { fetchMock };
}

const submit = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
};
const fileInput = () => {
  const input = document.getElementById('fb-files');
  if (!(input instanceof HTMLInputElement)) throw new Error('no file input');
  return input;
};
function file(name: string, type: string, size = 1024) {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}
const addFiles = (...files: File[]) => {
  fireEvent.change(fileInput(), { target: { files } });
};

function fillValid() {
  fireEvent.click(screen.getByRole('radio', { name: 'Bug' }));
  fireEvent.change(screen.getByLabelText(/^Title/), {
    target: { value: 'The Pay button freezes' },
  });
  fireEvent.change(screen.getByLabelText(/^Details/), {
    target: { value: 'Tapping Pay keeps spinning and nothing happens.' },
  });
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Nomin B.' } });
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'nomin.b@gmail.com' } });
  fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: '9911 2233' } });
}

interface PendingUpload {
  file: File;
  progress: (fraction: number) => void;
  signal: AbortSignal | undefined;
  resolve: (upload: PublicFeedbackUpload) => void;
  reject: (error: unknown) => void;
}

/** Each upload waits until the test settles it. */
function controlUploads() {
  const pending: PendingUpload[] = [];
  vi.mocked(uploadPublicFeedbackFile).mockImplementation(
    (_slug, f, onProgress, signal) =>
      new Promise((resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new DOMException('Upload cancelled', 'AbortError'));
        });
        pending.push({ file: f, progress: onProgress, signal, resolve, reject });
      }),
  );
  return pending;
}

const uploaded = (n: number): PublicFeedbackUpload => ({
  id: `01890000-0000-7000-8000-00000000090${String(n)}`,
  token: `token-${String(n)}`,
  filename: `file-${String(n)}`,
  mime: 'image/png',
  size: 1024,
});

describe('PublicFeedbackPage', () => {
  beforeEach(async () => {
    vi.mocked(uploadPublicFeedbackFile).mockReset();
    vi.mocked(removePublicFeedbackUpload).mockClear();
    // jsdom has no scrolling (the page scrolls to the top after sending).
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    await i18n.changeLanguage('en');
  });

  it('shows the workspace and no errors before the first submit', async () => {
    renderPage();
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Share feedback, report a bug, or request a feature',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Kite Studio').length).toBeGreaterThan(0);
    expect(screen.getByText('Kite Studio · Powered by Kite')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: /What is this about/ })).toBeInTheDocument();
    expect(document.title).toBe('Feedback · Kite Studio');
  });

  it('answers a missing page with a not-found state', async () => {
    renderPage({
      [`GET /api/v1/public/feedback/${SLUG}`]: () =>
        Response.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 }),
    });
    expect(
      await screen.findByRole('heading', { name: 'This feedback page doesn’t exist' }),
    ).toBeInTheDocument();
  });

  it('validates on submit: inline errors, a focused summary with links, then live', async () => {
    const { fetchMock } = renderPage();
    await screen.findByRole('button', { name: 'Send feedback' });
    submit();

    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent('Please fix 4 things before sending');
    expect(
      within(summary)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual([
      'Type not selected',
      'Title is empty',
      'Details are empty',
      'Email is missing or invalid',
    ]);
    await waitFor(() => {
      expect(summary).toHaveFocus();
    });
    const title = screen.getByLabelText(/^Title/);
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAccessibleDescription('Add a short title.');
    expect(screen.getByRole('radiogroup')).toHaveAccessibleDescription(
      'Choose what this is about.',
    );

    fireEvent.click(within(summary).getByRole('link', { name: 'Title is empty' }));
    expect(title).toHaveFocus();

    // Live after the first attempt.
    fireEvent.change(title, { target: { value: 'Checkout' } });
    fireEvent.change(screen.getByLabelText(/^Details/), { target: { value: 'Too short' } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'nomin@gmail' } });
    fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: '99-11' } });
    expect(title).not.toHaveAttribute('aria-invalid');
    expect(screen.getByRole('alert')).toHaveTextContent('Please fix 4 things before sending');
    expect(screen.getByText('Details are too short')).toBeInTheDocument();
    expect(
      screen.getByText('Add a little more detail (at least 20 characters).'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('That email doesn’t look right. Example: name@email.com'),
    ).toBeInTheDocument();
    expect(screen.getByText('Phone number should have at least 8 digits.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('maps the server’s field errors onto the fields and the summary', async () => {
    renderPage({
      [`POST /api/v1/public/feedback/${SLUG}`]: () =>
        Response.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid',
              fields: { email: 'emailInvalid', other: 'whatever' },
            },
          },
          { status: 400 },
        ),
    });
    await screen.findByRole('button', { name: 'Send feedback' });
    fillValid();
    submit();

    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent('Please fix 1 thing before sending');
    const email = screen.getByLabelText(/^Email/);
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription(
      'That email doesn’t look right. Example: name@email.com',
    );
    // Editing the field clears the server's verdict.
    fireEvent.change(email, { target: { value: 'nomin.b@gmail.co' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says when to try again after too many requests', async () => {
    renderPage({
      [`POST /api/v1/public/feedback/${SLUG}`]: () =>
        Response.json(
          { error: { code: 'RATE_LIMITED', message: 'Slow down' } },
          { status: 429, headers: { 'Retry-After': '600' } },
        ),
    });
    await screen.findByRole('button', { name: 'Send feedback' });
    fillValid();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You’ve sent several requests in a short time. Please try again in 10 minutes.',
    );
  });

  it('uploads each file right away and shows its progress, result or error', async () => {
    const pending = controlUploads();
    renderPage();
    await screen.findByRole('button', { name: 'Send feedback' });

    addFiles(
      file('checkout-error.png', 'image/png'),
      file('full-session.mp4', 'video/mp4', 24 * 1024 * 1024),
      file('notes.txt', 'text/plain'),
    );
    // Only the file that passes the checks goes to the server.
    expect(uploadPublicFeedbackFile).toHaveBeenCalledTimes(1);
    expect(screen.getByText('3/5')).toBeInTheDocument();

    const rows = within(screen.getByRole('list', { name: /Attachments/ })).getAllByRole('listitem');
    expect(rows[1]).toHaveTextContent('24 MB · Over 10 MB, so it won’t be attached.');
    expect(rows[2]).toHaveTextContent('This type of file can’t be attached.');

    pending[0]?.progress(0.4);
    const bar = await screen.findByRole('progressbar', { name: 'Uploading checkout-error.png' });
    await waitFor(() => {
      expect(bar).toHaveAttribute('aria-valuenow', '40');
    });
    expect(rows[0]).toHaveTextContent('40% · 1 KB');

    pending[0]?.resolve(uploaded(1));
    await waitFor(() => {
      expect(rows[0]).toHaveTextContent('1 KB · Uploaded');
    });
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

    // A server refusal shows on its row.
    addFiles(file('cart.png', 'image/png'));
    pending[1]?.reject(new ApiError(429, 'RATE_LIMITED', 'Too many'));
    expect(
      await screen.findByText(/Too many files at once\. Wait a few minutes/),
    ).toBeInTheDocument();

    // Removing a finished upload deletes it on the server.
    fireEvent.click(screen.getByRole('button', { name: 'Remove checkout-error.png' }));
    expect(removePublicFeedbackUpload).toHaveBeenCalledWith({
      id: uploaded(1).id,
      token: 'token-1',
    });
    expect(screen.getByText('3/5')).toBeInTheDocument();
  });

  it('cancels a running upload and ignores files past the limit', async () => {
    const pending = controlUploads();
    renderPage();
    await screen.findByRole('button', { name: 'Send feedback' });

    addFiles(file('screen-recording.mov', 'video/quicktime'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel upload: screen-recording.mov' }));
    expect(pending[0]?.signal?.aborted).toBe(true);
    expect(screen.queryByText('screen-recording.mov')).not.toBeInTheDocument();

    addFiles(...Array.from({ length: 7 }, (_, i) => file(`shot-${String(i)}.png`, 'image/png')));
    expect(screen.getByText('5/5')).toBeInTheDocument();
    expect(screen.queryByText('shot-5.png')).not.toBeInTheDocument();
    expect(screen.getByText('You can attach up to 5 files.')).toBeInTheDocument();
  });

  it('waits for running uploads on send, and a cancelled one lets it go without the file', async () => {
    controlUploads();
    let sent: unknown = null;
    renderPage({
      [`POST /api/v1/public/feedback/${SLUG}`]: (init) => {
        sent = JSON.parse(init?.body as string);
        return Response.json({ ...RESULT, attachmentCount: 0 }, { status: 201 });
      },
    });
    await screen.findByRole('button', { name: 'Send feedback' });
    fillValid();
    addFiles(file('stuck.mov', 'video/quicktime'));
    submit();
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeInTheDocument();
    expect(sent).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel upload: stuck.mov' }));
    await screen.findByRole('heading', { name: 'Thank you! We’ve received your feedback' });
    expect(sent).toMatchObject({ uploads: [] });
    expect(screen.getByText(/0 attachments · Just now/)).toBeInTheDocument();
  });

  it('sends, shows the reference, and "Submit another" keeps the contact details', async () => {
    const pending = controlUploads();
    let sent: unknown = null;
    renderPage({
      [`POST /api/v1/public/feedback/${SLUG}`]: (init) => {
        sent = JSON.parse(init?.body as string);
        return Response.json(RESULT, { status: 201 });
      },
    });
    await screen.findByRole('button', { name: 'Send feedback' });
    fillValid();
    addFiles(file('checkout-error.png', 'image/png'));

    // Sent while the file is still uploading: waits for it, then goes out.
    submit();
    expect(screen.getByRole('button', { name: 'Sending…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(
      screen.getByText('Uploading your files. Please keep this page open.'),
    ).toBeInTheDocument();
    pending[0]?.resolve(uploaded(1));

    const heading = await screen.findByRole('heading', {
      name: 'Thank you! We’ve received your feedback',
    });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    expect(sent).toMatchObject({
      type: 'bug',
      title: 'The Pay button freezes',
      body: 'Tapping Pay keeps spinning and nothing happens.',
      name: 'Nomin B.',
      email: 'nomin.b@gmail.com',
      phone: '9911 2233',
      uploads: [{ id: uploaded(1).id, token: 'token-1' }],
      website: '',
      client: { language: expect.any(String) as unknown, timezone: expect.any(String) as unknown },
    });
    expect(screen.getByText('FB-1047')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy FB-1047' })).toBeInTheDocument();
    expect(screen.getByText('nomin.b@gmail.com')).toBeInTheDocument();
    expect(screen.getByText(/1 attachment · Just now/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Submit another' }));
    await screen.findByRole('button', { name: 'Send feedback' });
    expect(screen.getByLabelText(/^Title/)).toHaveValue('');
    expect(screen.getByRole('radio', { name: 'Bug' })).not.toBeChecked();
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Nomin B.');
    expect(screen.getByLabelText(/^Email/)).toHaveValue('nomin.b@gmail.com');
    expect(screen.getByLabelText(/^Phone/)).toHaveValue('9911 2233');
    expect(screen.getByText('0/5')).toBeInTheDocument();
  });
});
