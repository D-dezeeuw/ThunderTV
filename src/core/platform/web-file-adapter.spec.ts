import { afterEach, describe, expect, it } from 'vitest';
import { M3U_ACCEPT, READ_TEXT_SIZE_LIMIT_BYTES, WebFileAdapter, XMLTV_ACCEPT } from './web-file-adapter';

function findPickerInput(): HTMLInputElement {
    const input = document.body.querySelector('input[type="file"]');
    if (!input) throw new Error('expected pickFile() to have appended an <input type="file">');
    return input as HTMLInputElement;
}

function setInputFiles(input: HTMLInputElement, files: File[]): void {
    const fileList = {
        ...files,
        length: files.length,
        item: (i: number) => files[i] ?? null,
        [Symbol.iterator]: function* () {
            yield* files;
        },
    } as unknown as FileList;
    Object.defineProperty(input, 'files', { value: fileList, configurable: true });
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('WebFileAdapter.pickFile', () => {
    it('resolves the picked file with name/size on a real change event', async () => {
        const adapter = new WebFileAdapter();
        const pending = adapter.pickFile(M3U_ACCEPT);

        const input = findPickerInput();
        const file = new File(['#EXTM3U'], 'playlist.m3u', { type: 'audio/x-mpegurl' });
        setInputFiles(input, [file]);
        input.dispatchEvent(new Event('change'));

        const picked = await pending;
        expect(picked).toEqual({ name: 'playlist.m3u', size: file.size, file });
    });

    it('resolves null when the picker is cancelled', async () => {
        const adapter = new WebFileAdapter();
        const pending = adapter.pickFile(M3U_ACCEPT);

        const input = findPickerInput();
        input.dispatchEvent(new Event('cancel'));

        expect(await pending).toBeNull();
    });

    it('removes the input element from the DOM once settled', async () => {
        const adapter = new WebFileAdapter();
        const pending = adapter.pickFile(M3U_ACCEPT);
        findPickerInput().dispatchEvent(new Event('cancel'));
        await pending;

        expect(document.body.querySelector('input[type="file"]')).toBeNull();
    });

    it('sets the accept attribute from the caller-supplied constant', () => {
        const adapter = new WebFileAdapter();
        void adapter.pickFile(XMLTV_ACCEPT);
        expect(findPickerInput().accept).toBe(XMLTV_ACCEPT);
    });
});

describe('WebFileAdapter.readText', () => {
    it('round-trips a constructed File back to its original text', async () => {
        const adapter = new WebFileAdapter();
        const file = new File(['#EXTM3U\n#EXTINF:-1,Channel\nhttp://example/stream'], 'playlist.m3u');
        const result = await adapter.readText(file);
        expect(result).toEqual({ kind: 'ok', text: '#EXTM3U\n#EXTINF:-1,Channel\nhttp://example/stream' });
    });

    it('returns a classified too-large result instead of throwing past the size guard', async () => {
        const adapter = new WebFileAdapter();
        const oversized = new File([new Uint8Array(1)], 'huge.m3u');
        Object.defineProperty(oversized, 'size', { value: READ_TEXT_SIZE_LIMIT_BYTES + 1 });

        const result = await adapter.readText(oversized);
        expect(result).toEqual({
            kind: 'too-large',
            sizeBytes: READ_TEXT_SIZE_LIMIT_BYTES + 1,
            limitBytes: READ_TEXT_SIZE_LIMIT_BYTES,
        });
    });
});
