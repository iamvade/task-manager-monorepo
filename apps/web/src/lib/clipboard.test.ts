import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

function setClipboard(value: Clipboard | undefined) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}
function setSecure(value: boolean) {
  Object.defineProperty(window, 'isSecureContext', { value, configurable: true });
}
function stubExecCommand(result: boolean) {
  const exec = vi.fn((_command: string) => result);
  Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
  return exec;
}

afterEach(() => {
  vi.restoreAllMocks();
  setClipboard(undefined);
  setSecure(true);
});

describe('copyText', () => {
  it('uses the async clipboard in a secure context', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setSecure(true);
    setClipboard({ writeText } as unknown as Clipboard);
    const exec = stubExecCommand(true);
    await copyText('https://kite.test/t/APP-1');
    expect(writeText).toHaveBeenCalledWith('https://kite.test/t/APP-1');
    expect(exec).not.toHaveBeenCalled();
  });

  it('falls back to execCommand over plain http', async () => {
    setSecure(false);
    setClipboard(undefined);
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    const exec = stubExecCommand(true);
    await copyText('http://10.0.0.5/t/APP-1');
    expect(exec).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
    expect(document.activeElement).toBe(button);
    button.remove();
  });

  it('falls back when the async clipboard rejects', async () => {
    setSecure(true);
    setClipboard({
      writeText: () => Promise.reject(new Error('denied')),
    } as unknown as Clipboard);
    const exec = stubExecCommand(true);
    await copyText('x');
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('rejects when the copy command fails', async () => {
    setSecure(false);
    stubExecCommand(false);
    await expect(copyText('x')).rejects.toThrow();
    expect(document.querySelector('textarea')).toBeNull();
  });
});
