import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Print only one part of the page: the recovery note or the receipt (see .print-* in global.css). */
function printPart(part: 'note' | 'receipt') {
  document.body.dataset.print = part;
  const clear = () => {
    delete document.body.dataset.print;
    window.removeEventListener('afterprint', clear);
  };
  window.addEventListener('afterprint', clear);
  window.print();
}

/** A text to keep, with buttons to save, print and copy it. Folded hides the text until asked; saving and printing work either way. */
export function TextPanel({ text, filename, part, folded = false }: { text: string; filename: string; part: 'note' | 'receipt'; folded?: boolean }) {
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(!folded);
  const pre = useRef<HTMLPreElement>(null);
  const onCopy = async () => {
    if (await copy(text)) setStatus('Copied.');
    else {
      flushSync(() => setOpen(true));
      const range = document.createRange();
      if (pre.current) range.selectNodeContents(pre.current);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      setStatus('Copying was blocked. The text is selected: press Ctrl+C or Cmd+C.');
    }
  };
  return (
    <>
      <div className="copy-row">
        <button type="button" className="btn small" onClick={() => download(text, filename)}>
          Save as a text file
        </button>
        <button type="button" className="btn ghost small" onClick={() => printPart(part)}>
          Print
        </button>
        <button type="button" className="btn ghost small" onClick={onCopy}>
          Copy
        </button>
        {folded && (
          <button type="button" className="link-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide the text' : 'Show the text'}
          </button>
        )}
        <span className="status-line" aria-live="polite">
          {status}
        </span>
      </div>
      <pre className={`recovery print-${part}`} hidden={!open} ref={pre}>
        {text}
      </pre>
    </>
  );
}
